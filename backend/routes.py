from fastapi import APIRouter, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect
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
    Deduplicates by ticker, keeping only the most recently updated entry per ticker.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    cursor = db.ticker_analysis.find({})
    ticker_map: dict = {}  # ticker -> best report_data
    
    async for doc in cursor:
        ticker_name = doc.get("ticker")
        if not ticker_name:
            continue
            
        report_data = {
            "ticker": ticker_name,
            "current_price": doc.get("current_price"),
            "last_updated": doc.get("last_updated").isoformat() if isinstance(doc.get("last_updated"), datetime) else str(doc.get("last_updated")),
            "hs_pattern": doc.get("hs_pattern")
        }
        
        # Include trade report if it exists
        trade_report = doc.get("trade_report")
        report_data["trade_report"] = trade_report if trade_report else None

        # Keep the most recently updated entry per ticker
        existing = ticker_map.get(ticker_name)
        if existing is None:
            ticker_map[ticker_name] = report_data
        else:
            # Compare last_updated timestamps; keep newer
            if str(report_data["last_updated"]) > str(existing["last_updated"]):
                ticker_map[ticker_name] = report_data

    reports = list(ticker_map.values())
        
    # Sort: put tickers with trade signals (not None) first, and sort them by win conviction pct descending
    active_signals = [r for r in reports if r["trade_report"] is not None]
    no_signals = [r for r in reports if r["trade_report"] is None]
    
    active_signals.sort(key=lambda x: x["trade_report"].get("win_conviction_pct", 0), reverse=True)
    
    return active_signals + no_signals

@router.get("/ticker/{symbol}")
async def get_ticker_history(symbol: str, interval: str = "1d"):
    """
    Retrieves full OHLCV history, EMA curves, candlestick patterns, and H&S overlay geometry
    for rendering on the chart.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    valid_intervals = ["1d", "1h", "15m", "5m"]
    if interval not in valid_intervals:
        raise HTTPException(status_code=400, detail=f"Invalid interval. Must be one of {valid_intervals}")

    doc = await db.ticker_analysis.find_one({"ticker": symbol.upper(), "interval": interval})
    if not doc:
        try:
            res = await fetch_and_analyze(symbol.upper(), interval)
            doc = {
                "ticker": res["ticker"],
                "interval": interval,
                "current_price": res["current_price"],
                "history": res["history"],
                "hs_pattern": res["hs_pattern"],
                "trade_report": res["trade_report"],
                "last_updated": datetime.utcnow()
            }
            await db.ticker_analysis.update_one(
                {"ticker": res["ticker"], "interval": interval},
                {"$set": doc},
                upsert=True
            )
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"No analysis data found for symbol {symbol} ({interval}) and failed to fetch on-the-fly: {str(e)}")
        
    return {
        "ticker": doc.get("ticker"),
        "interval": doc.get("interval", "1d"),
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

import asyncio
import random

@router.websocket("/ws/ticker/{symbol}")
async def websocket_ticker(websocket: WebSocket, symbol: str):
    await websocket.accept()
    sym = symbol.upper().strip()
    db = db_instance.db
    if db is None:
        await websocket.close(code=1011, reason="Database not initialized")
        return
        
    doc = await db.ticker_analysis.find_one({"ticker": sym})
    last_price = 100.0
    if doc and doc.get("history"):
        history = doc["history"]
        if len(history) > 0:
            last_price = history[-1]["close"]
            
    logger.info(f"WebSocket client connected for ticker: {sym}. Starting stream at ${last_price:.2f}")
    
    try:
        current_close = last_price
        while True:
            # Fluctuate price slightly
            fluctuation = (random.random() - 0.5) * 0.0016
            current_close = current_close * (1 + fluctuation)
            
            await websocket.send_json({
                "ticker": sym,
                "price": current_close,
                "timestamp": datetime.utcnow().isoformat()
            })
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for ticker: {sym}")
    except Exception as e:
        logger.error(f"WebSocket error for {sym}: {str(e)}")
