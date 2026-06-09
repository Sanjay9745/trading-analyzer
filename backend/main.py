import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from db import db_instance
from routes import router

# Setup basic logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions
    logger.info("Starting up FastAPI application...")
    db_instance.connect_db()
    
    yield
    
    # Shutdown actions
    logger.info("Shutting down FastAPI application...")
    db_instance.close_db()

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
