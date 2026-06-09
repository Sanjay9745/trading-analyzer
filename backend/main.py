import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import db_instance
from routes import router
from config import SCHEDULER_BATCH_SIZE, SCHEDULER_BATCH_DELAY_SECONDS
from worker import run_batch_scan
from stock_catalog import STOCK_CATALOG
from redis_cache import redis_cache

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Scheduler loop task reference
scheduler_task = None

async def run_partitioned_full_scan():
    """
    Executes a complete scan of the stock catalog divided into small chunks 
    to prevent system overload and respect yfinance rate limits.
    """
    logger.info("Starting scheduled midnight full scan...")
    tickers = [s["symbol"] for s in STOCK_CATALOG]
    
    chunk_size = SCHEDULER_BATCH_SIZE
    chunks = [tickers[i:i + chunk_size] for i in range(0, len(tickers), chunk_size)]
    
    for idx, chunk in enumerate(chunks):
        logger.info(f"Scheduled scan: processing chunk {idx+1}/{len(chunks)} containing {len(chunk)} tickers...")
        try:
            await run_batch_scan(chunk)
        except Exception as e:
            logger.error(f"Error in scheduled chunk scan {idx+1}: {e}")
            
        if idx < len(chunks) - 1:
            logger.info(f"Chunk processed. Sleeping for {SCHEDULER_BATCH_DELAY_SECONDS} seconds before the next batch...")
            await asyncio.sleep(SCHEDULER_BATCH_DELAY_SECONDS)
            
    logger.info("Scheduled midnight full scan completed successfully.")

async def scheduler_loop():
    """
    Sleeps until the next midnight, then starts a partitioned scan.
    """
    logger.info("Scheduler Loop active.")
    # Brief initial pause to let database connections settle on startup
    await asyncio.sleep(15)
    
    while True:
        now = datetime.now()
        # Find next midnight
        next_run = datetime.combine(now.date() + timedelta(days=1), datetime.min.time())
        seconds_to_wait = (next_run - now).total_seconds()
        
        logger.info(f"Midnight scheduler: Next scan scheduled at {next_run} (in {seconds_to_wait:.1f} seconds)")
        
        try:
            await asyncio.sleep(seconds_to_wait)
            # Run the partitioned scan in a non-blocking background task
            asyncio.create_task(run_partitioned_full_scan())
        except asyncio.CancelledError:
            logger.info("Scheduler Loop cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in scheduler sleep loop: {e}")
            await asyncio.sleep(60)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global scheduler_task
    # Startup actions
    logger.info("Starting up FastAPI application...")
    db_instance.connect_db()
    await redis_cache.connect()
    
    # Clean up stale ticker_analysis documents that don't have an 'interval' field
    if db_instance.db is not None:
        try:
            result = await db_instance.db.ticker_analysis.delete_many(
                {"interval": {"$exists": False}}
            )
            if result.deleted_count > 0:
                logger.info(f"Cleaned up {result.deleted_count} stale ticker_analysis documents.")
        except Exception as e:
            logger.warning(f"Failed to clean stale documents: {e}")
            
    # Start the midnight scheduler loop
    scheduler_task = asyncio.create_task(scheduler_loop())
    
    yield
    
    # Shutdown actions
    logger.info("Shutting down FastAPI application...")
    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass
            
    db_instance.close_db()
    await redis_cache.disconnect()

app = FastAPI(
    title="Stock Market Analytics Platform API",
    description="Quantitative analysis and pattern detection ",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware for React connection
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In development, let's allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(router)

@app.get("/")
async def root():
    return {"message": "Trading Analyzer API is active. Go to /docs for Swagger documentation."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
