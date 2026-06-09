import logging
from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGODB_URL, DATABASE_NAME

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

    @classmethod
    def connect_db(cls):
        logger.info(f"Connecting to MongoDB at {MONGODB_URL}")
        cls.client = AsyncIOMotorClient(MONGODB_URL)
        cls.db = cls.client[DATABASE_NAME]

    @classmethod
    def close_db(cls):
        if cls.client:
            logger.info("Closing MongoDB connection")
            cls.client.close()

db_instance = Database
