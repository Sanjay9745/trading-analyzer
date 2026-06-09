from fastapi import APIRouter, BackgroundTasks, HTTPException, WebSocket, WebSocketDisconnect, Request, Depends
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
from db import db_instance
from worker import run_batch_scan, fetch_and_analyze
from config import DEFAULT_TICKERS, SESSION_LIFETIME_DAYS
from stock_catalog import STOCK_CATALOG
from auth import hash_password, verify_password, generate_token, get_current_user
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")

@router.get("/stocks/search")
async def search_stocks(q: Optional[str] = None, exchange: Optional[str] = None):
    """
    Search/filter the static stock catalog.
    """
    results = STOCK_CATALOG
    if exchange:
        exch = exchange.upper().strip()
        if exch != "ALL":
            results = [s for s in results if s["exchange"].upper() == exch]
    if q:
        query = q.lower().strip()
        results = [
            s for s in results 
            if query in s["symbol"].lower() or query in s["name"].lower() or query in s["sector"].lower()
        ]
    return results


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

# --- AUTHENTICATION SCHEMAS & ROUTES ---

class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/auth/register")
async def register(payload: RegisterRequest):
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    
    email = payload.email.lower().strip()
    password = payload.password
    
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
        
    # Check if user already exists
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    hashed, salt = hash_password(password)
    
    user_doc = {
        "email": email,
        "hashed_password": hashed,
        "salt": salt,
        "created_at": datetime.utcnow()
    }
    
    try:
        await db.users.insert_one(user_doc)
        # Create initial default watchlist for user
        await db.watchlist.insert_one({"user_email": email, "tickers": DEFAULT_TICKERS})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")
        
    return {"message": "User registered successfully"}

@router.post("/auth/login")
async def login(payload: LoginRequest):
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    email = payload.email.lower().strip()
    password = payload.password
    
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    if not verify_password(password, user["salt"], user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Invalid email or password")
        
    token = generate_token()
    expires_at = datetime.utcnow() + timedelta(days=SESSION_LIFETIME_DAYS)
    
    session_doc = {
        "token": token,
        "email": email,
        "expires_at": expires_at,
        "created_at": datetime.utcnow()
    }
    
    await db.sessions.insert_one(session_doc)
    
    return {"token": token, "email": email}

@router.post("/auth/logout")
async def logout(request: Request):
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.headers.get("x-session-token")
        
    if token:
        db = db_instance.db
        if db is not None:
            await db.sessions.delete_one({"token": token})
            
    return {"message": "Logged out successfully"}

@router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {"email": current_user["email"]}


# --- PERSISTENT USER-SPECIFIC WATCHLISTS ---

@router.get("/watchlist")
async def get_watchlist(current_user: dict = Depends(get_current_user)):
    """
    Fetches watchlist uniquely associated with the logged-in user.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    email = current_user["email"]
    wl_doc = await db.watchlist.find_one({"user_email": email})
    if not wl_doc:
        # Create user's default watchlist if none exists
        await db.watchlist.update_one(
            {"user_email": email},
            {"$set": {"tickers": DEFAULT_TICKERS}},
            upsert=True
        )
        return DEFAULT_TICKERS
        
    return wl_doc.get("tickers", [])

@router.post("/watchlist")
async def add_to_watchlist(payload: WatchlistRequest, current_user: dict = Depends(get_current_user)):
    """
    Appends a new ticker symbol to the user's private watchlist.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    symbol = payload.ticker.upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="Ticker symbol cannot be empty")
        
    email = current_user["email"]
    wl_doc = await db.watchlist.find_one({"user_email": email})
    tickers = wl_doc.get("tickers", []) if wl_doc else DEFAULT_TICKERS.copy()
    
    if symbol not in tickers:
        tickers.append(symbol)
        await db.watchlist.update_one(
            {"user_email": email},
            {"$set": {"tickers": tickers}},
            upsert=True
        )
        
    return {"watchlist": tickers}

@router.delete("/watchlist/{symbol}")
async def remove_from_watchlist(symbol: str, current_user: dict = Depends(get_current_user)):
    """
    Removes a ticker symbol from the user's private watchlist.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    sym = symbol.upper().strip()
    email = current_user["email"]
    wl_doc = await db.watchlist.find_one({"user_email": email})
    tickers = wl_doc.get("tickers", []) if wl_doc else DEFAULT_TICKERS.copy()
    
    if sym in tickers:
        tickers.remove(sym)
        await db.watchlist.update_one(
            {"user_email": email},
            {"$set": {"tickers": tickers}},
            upsert=True
        )
        
    return {"watchlist": tickers}


# --- QUANT DASHBOARD ENDPOINTS ---

@router.get("/scanner/signal-matrix")
async def get_signal_matrix():
    """
    Retrieves latest quantitative analysis results for all stocks to display on the Algorithmic Signal Matrix.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    cursor = db.ticker_analysis.find({})
    results = []
    async for doc in cursor:
        results.append({
            "ticker": doc.get("ticker"),
            "interval": doc.get("interval", "1d"),
            "current_price": doc.get("current_price"),
            "last_updated": doc.get("last_updated").isoformat() if isinstance(doc.get("last_updated"), datetime) else str(doc.get("last_updated")),
            "hs_pattern": doc.get("hs_pattern"),
            "trade_report": doc.get("trade_report")
        })
    return results

@router.get("/scanner/priority-trades")
async def get_priority_trades():
    """
    Filters and retrieves tickers showing active patterns with buy/sell triggers to display on Priority Stocks page.
    """
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    cursor = db.ticker_analysis.find({"trade_report": {"$ne": None}})
    results = []
    async for doc in cursor:
        results.append({
            "ticker": doc.get("ticker"),
            "current_price": doc.get("current_price"),
            "last_updated": doc.get("last_updated").isoformat() if isinstance(doc.get("last_updated"), datetime) else str(doc.get("last_updated")),
            "hs_pattern": doc.get("hs_pattern"),
            "trade_report": doc.get("trade_report")
        })
        
    # Sort by win conviction descending
    results.sort(key=lambda x: x["trade_report"].get("win_conviction_pct", 0), reverse=True)
    return results


# --- WEBSOCKET REAL-TIME SIMULATOR ---

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
