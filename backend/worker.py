import asyncio
import logging
import time
import urllib.request
import random
import threading
from datetime import datetime
import pandas as pd
import yfinance as yf
from tenacity import retry, stop_after_attempt, wait_random_exponential, retry_if_exception_type
from config import RATE_LIMIT_SEMAPHORE_LIMIT, BATCH_DELAY_SECONDS, USE_PROXIES
from analyzer import analyze_ticker
from db import db_instance

logger = logging.getLogger(__name__)
yf_lock = threading.Lock()

class ProxyManager:
    _proxies = []
    _working_proxy = None
    _last_fetched = 0
    _fetch_interval = 600  # 10 minutes in seconds

    @classmethod
    def get_proxy(cls) -> str | None:
        now = time.time()
        # Fetch fresh proxies every 10 minutes or if list is empty
        if not cls._proxies or (now - cls._last_fetched) > cls._fetch_interval:
            cls.refresh_proxies()
            
        if cls._proxies:
            return random.choice(cls._proxies)
        return None

    @classmethod
    def refresh_proxies(cls):
        logger.info("Fetching fresh free proxy list...")
        new_proxies = []
        try:
            # SOCKS-List HTTP/HTTPS proxy list is fresh and updated regularly
            url = "https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as response:
                content = response.read().decode('utf-8')
                for line in content.splitlines():
                    val = line.strip()
                    if val:
                        new_proxies.append(f"http://{val}")
            if new_proxies:
                cls._proxies = new_proxies
                cls._last_fetched = time.time()
                logger.info(f"Loaded {len(cls._proxies)} free proxies for rotation.")
        except Exception as e:
            logger.warning(f"Failed to fetch proxy list: {e}. Falling back to cached list or direct fetching.")

    @classmethod
    def remove_proxy(cls, proxy: str):
        if proxy in cls._proxies:
            try:
                cls._proxies.remove(proxy)
                logger.info(f"Removed failed proxy {proxy} from list. Remaining: {len(cls._proxies)}")
            except ValueError:
                pass

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
    Synchronous yfinance data retrieval wrapped in retry block with proxy rotation.
    Handles '4h' interval by downloading '1h' data and resampling.
    """
    period_map = {
        "1d": "1y",
        "4h": "730d",
        "1h": "730d",
        "15m": "60d",
        "5m": "60d"
    }
    actual_interval = "1h" if interval == "4h" else interval
    period = period_map.get(interval, "1y")
    df = pd.DataFrame()

    # 1. Try with proxies first (if enabled)
    if USE_PROXIES:
        # 1.a. Try cached working proxy first
        if ProxyManager._working_proxy:
            proxy = ProxyManager._working_proxy
            try:
                logger.info(f"Trying cached working proxy: {proxy}...")
                with yf_lock:
                    try:
                        yf.config.network.proxy = {"http": proxy, "https": proxy}
                        t = yf.Ticker(ticker)
                        df = t.history(period=period, interval=actual_interval)
                    finally:
                        yf.config.network.proxy = None
                if df.empty:
                    logger.warning(f"Cached working proxy {proxy} returned empty data for {ticker}. Clearing cache.")
                    ProxyManager._working_proxy = None
            except Exception as e:
                logger.warning(f"Cached working proxy {proxy} failed for {ticker}: {e}")
                ProxyManager._working_proxy = None
                ProxyManager.remove_proxy(proxy)

        # 1.b. Try rotation if cached proxy didn't work or wasn't set
        if df.empty:
            for attempt in range(3): # Try up to 3 different proxies
                proxy = ProxyManager.get_proxy()
                if not proxy:
                    break
                try:
                    logger.info(f"Proxy attempt {attempt+1}/3: Fetching {ticker} via {proxy}...")
                    with yf_lock:
                        try:
                            yf.config.network.proxy = {"http": proxy, "https": proxy}
                            t = yf.Ticker(ticker)
                            df = t.history(period=period, interval=actual_interval)
                        finally:
                            yf.config.network.proxy = None
                    if not df.empty:
                        ProxyManager._working_proxy = proxy
                        logger.info(f"Successfully cached working proxy: {proxy}")
                        break
                except Exception as e:
                    logger.warning(f"Proxy {proxy} failed for {ticker}: {e}")
                    ProxyManager.remove_proxy(proxy)
                
    # 2. Direct fetch fallback
    if df.empty:
        logger.info(f"Fetching data for {ticker} from yfinance directly...")
        with yf_lock:
            try:
                yf.config.network.proxy = None
                t = yf.Ticker(ticker)
                df = t.history(period=period, interval=actual_interval)
            finally:
                yf.config.network.proxy = None
        if df.empty:
            raise ValueError(f"No historical data found for {ticker} (interval: {actual_interval})")
    
    # Deduplicate and sort index
    df = df[~df.index.duplicated(keep='last')]
    df = df.sort_index()

    # Resample 1h to 4h
    if interval == "4h":
        df.index = pd.to_datetime(df.index)
        resample_dict = {
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }
        cols_to_resample = {col: agg for col, agg in resample_dict.items() if col in df.columns}
        df = df.resample('4h').agg(cols_to_resample)
        df = df.dropna(subset=['Close'])

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
                try:
                    from redis_cache import redis_cache
                    await redis_cache.delete(f"ticker_cache:{res['ticker']}:1d")
                except Exception as cache_err:
                    logger.warning(f"Failed to clear Redis cache on update: {cache_err}")
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
