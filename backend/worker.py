import asyncio
import logging
from datetime import datetime
import pandas as pd
import yfinance as yf
from tenacity import retry, stop_after_attempt, wait_random_exponential, retry_if_exception_type
from config import RATE_LIMIT_SEMAPHORE_LIMIT, BATCH_DELAY_SECONDS
from analyzer import analyze_ticker
from db import db_instance

logger = logging.getLogger(__name__)

# Semaphore to restrict concurrent yfinance network calls
sem = asyncio.Semaphore(RATE_LIMIT_SEMAPHORE_LIMIT)

@retry(
    stop=stop_after_attempt(4),
    wait=wait_random_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(Exception),
    reraise=True
)
def fetch_ticker_data_sync(ticker: str, interval: str = "1d") -> pd.DataFrame:
    """
    Synchronous yfinance data retrieval wrapped in retry block.
    """
    logger.info(f"Fetching data for {ticker} from yfinance with interval {interval}...")
    t = yf.Ticker(ticker)
    
    period_map = {
        "1d": "1y",
        "1h": "730d",
        "15m": "60d",
        "5m": "60d"
    }
    period = period_map.get(interval, "1y")
    
    df = t.history(period=period, interval=interval)
    if df.empty:
        raise ValueError(f"No historical data found for {ticker} (interval: {interval})")
    
    # Deduplicate and sort index to prevent frontend lightweight-charts duplicate timestamp assertions
    df = df[~df.index.duplicated(keep='last')]
    df = df.sort_index()
    return df

async def fetch_and_analyze(ticker: str, interval: str = "1d") -> dict:
    """
    Acquires semaphore, fetches data, runs quantitative analysis, and returns result.
    """
    async with sem:
        # Delay between fetches to prevent rate limiting
        await asyncio.sleep(BATCH_DELAY_SECONDS)
        
        loop = asyncio.get_running_loop()
        try:
            # Run blocking yfinance fetch in thread pool
            df = await loop.run_in_executor(None, fetch_ticker_data_sync, ticker, interval)
            
            # Analyze historical data
            result = analyze_ticker(df, ticker, interval)
            return result
        except Exception as e:
            logger.error(f"Error fetching/analyzing {ticker}: {str(e)}")
            raise

async def run_batch_scan(tickers: list) -> dict:
    """
    Executes scans in parallel with semaphores, saving reports to MongoDB.
    """
    logger.info(f"Starting batch scan for {len(tickers)} tickers: {tickers}")
    
    tasks = []
    for ticker in tickers:
        tasks.append(fetch_and_analyze(ticker))
        
    # Gather responses
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    successful_tickers = []
    failed_tickers = []
    
    # Store results in MongoDB
    db = db_instance.db
    if db is None:
        logger.error("MongoDB is not connected. Skipping DB save.")
        return {"error": "Database not connected"}
        
    for ticker, res in zip(tickers, results):
        if isinstance(res, Exception):
            failed_tickers.append({"ticker": ticker, "error": str(res)})
        else:
            successful_tickers.append(ticker)
            # Save or update in MongoDB (keyed by ticker + interval)
            analysis_doc = {
                "ticker": res["ticker"],
                "interval": "1d",
                "current_price": res["current_price"],
                "history": res["history"],
                "hs_pattern": res["hs_pattern"],
                "trade_report": res["trade_report"],
                "last_updated": datetime.utcnow()
            }
            try:
                await db.ticker_analysis.update_one(
                    {"ticker": res["ticker"], "interval": "1d"},
                    {"$set": analysis_doc},
                    upsert=True
                )
            except Exception as db_err:
                logger.error(f"DB Update Error for {ticker}: {str(db_err)}")
                failed_tickers.append({"ticker": ticker, "error": f"DB save failed: {str(db_err)}"})
                
    summary = {
        "timestamp": datetime.utcnow(),
        "total_scanned": len(tickers),
        "successful": successful_tickers,
        "failed": failed_tickers
    }
    
    # Save a run report summary to a collection
    try:
        await db.scan_reports.insert_one(summary.copy())
    except Exception as db_err:
        logger.error(f"Failed to save scan report summary: {str(db_err)}")
        
    logger.info(f"Completed batch scan. Success: {len(successful_tickers)}, Failures: {len(failed_tickers)}")
    return summary
