from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from db import db_instance
from worker import run_batch_scan, fetch_and_analyze
from config import DEFAULT_TICKERS
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

class WatchlistRequest(BaseModel):
    ticker: str

class TickerScanRequest(BaseModel):
    tickers: Optional[List[str]] = None

@router.post("/scanner/run")
async def trigger_scanner(payload: TickerScanRequest, background_tasks: BackgroundTasks):
    """
    Triggers background batch scan for either a list of provided tickers,
    the user's watchlist, or default tickers if no list is provided.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    tickers = payload.tickers
    
    # If not provided, fetch from watchlist
    if not tickers:
        wl_doc = await db.watchlist.find_one({"id": "user_default"})
        if wl_doc:
            tickers = wl_doc.get("tickers", [])
            
    # Fallback to defaults
    if not tickers:
        tickers = DEFAULT_TICKERS
        
    # Run task in background
    background_tasks.add_task(run_batch_scan, tickers)
    
    return {"status": "scanning", "message": f"Scan triggered for {len(tickers)} tickers in background"}

@router.get("/scanner/report")
async def get_scanner_reports():
    """
    Fetches the latest analyzed data for all tickers and returns computed trade signals
    sorted by highest win conviction percentage.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    cursor = db.ticker_analysis.find({})
    reports = []
    
    async for doc in cursor:
        report_data = {
            "ticker": doc.get("ticker"),
            "current_price": doc.get("current_price"),
            "last_updated": doc.get("last_updated").isoformat() if isinstance(doc.get("last_updated"), datetime) else str(doc.get("last_updated")),
            "hs_pattern": doc.get("hs_pattern")
        }
        
        # Include trade report if it exists
        trade_report = doc.get("trade_report")
        if trade_report:
            report_data["trade_report"] = trade_report
        else:
            report_data["trade_report"] = None
            
        reports.append(report_data)
        
    # Sort: put tickers with trade signals (not None) first, and sort them by win conviction pct descending
    active_signals = [r for r in reports if r["trade_report"] is not None]
    no_signals = [r for r in reports if r["trade_report"] is None]
    
    active_signals.sort(key=lambda x: x["trade_report"].get("win_conviction_pct", 0), reverse=True)
    
    return active_signals + no_signals

@router.get("/ticker/{symbol}")
async def get_ticker_history(symbol: str):
    """
    Retrieves full OHLCV history, EMA curves, candlestick patterns, and H&S overlay geometry
    for rendering on the chart.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    doc = await db.ticker_analysis.find_one({"ticker": symbol.upper()})
    if not doc:
        try:
            res = await fetch_and_analyze(symbol.upper())
            doc = {
                "ticker": res["ticker"],
                "current_price": res["current_price"],
                "history": res["history"],
                "hs_pattern": res["hs_pattern"],
                "trade_report": res["trade_report"],
                "last_updated": datetime.utcnow()
            }
            await db.ticker_analysis.update_one(
                {"ticker": res["ticker"]},
                {"$set": doc},
                upsert=True
            )
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"No analysis data found for symbol {symbol} and failed to fetch on-the-fly: {str(e)}")
        
    return {
        "ticker": doc.get("ticker"),
        "current_price": doc.get("current_price"),
        "history": doc.get("history", []),
        "hs_pattern": doc.get("hs_pattern"),
        "trade_report": doc.get("trade_report"),
        "last_updated": doc.get("last_updated").isoformat() if isinstance(doc.get("last_updated"), datetime) else str(doc.get("last_updated"))
    }

@router.get("/watchlist")
async def get_watchlist():
    """
    Fetches watchlist. Falls back to default list if not created yet.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    wl_doc = await db.watchlist.find_one({"id": "user_default"})
    if not wl_doc:
        # Create default
        await db.watchlist.update_one(
            {"id": "user_default"},
            {"$set": {"tickers": DEFAULT_TICKERS}},
            upsert=True
        )
        return DEFAULT_TICKERS
        
    return wl_doc.get("tickers", [])

@router.post("/watchlist")
async def add_to_watchlist(payload: WatchlistRequest):
    """
    Appends a new ticker symbol to the user watchlist.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    symbol = payload.ticker.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Ticker symbol cannot be empty")
        
    # Check if watchlist doc exists
    wl_doc = await db.watchlist.find_one({"id": "user_default"})
    tickers = wl_doc.get("tickers", []) if wl_doc else DEFAULT_TICKERS.copy()
    
    if symbol not in tickers:
        tickers.append(symbol)
        await db.watchlist.update_one(
            {"id": "user_default"},
            {"$set": {"tickers": tickers}},
            upsert=True
        )
        
    return {"watchlist": tickers}

@router.delete("/watchlist/{symbol}")
async def remove_from_watchlist(symbol: str):
    """
    Removes a ticker symbol from the user watchlist.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    sym = symbol.upper().strip()
    wl_doc = await db.watchlist.find_one({"id": "user_default"})
    tickers = wl_doc.get("tickers", []) if wl_doc else DEFAULT_TICKERS.copy()
    
    if sym in tickers:
        tickers.remove(sym)
        await db.watchlist.update_one(
            {"id": "user_default"},
            {"$set": {"tickers": tickers}},
            upsert=True
        )
        
    return {"watchlist": tickers}
