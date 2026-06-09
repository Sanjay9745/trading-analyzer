import os

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = "trading_analyzer"
RATE_LIMIT_SEMAPHORE_LIMIT = 2
BATCH_DELAY_SECONDS = 0.5

DEFAULT_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META",
    "TSLA", "NVDA", "NFLX", "AMD", "INTC",
    "SPY", "QQQ", "IWM", "COIN", "MARA"
]
