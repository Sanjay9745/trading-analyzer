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
        
        # Asynchronously create collection indexes
        import asyncio
        asyncio.create_task(cls.create_indexes())

    @classmethod
    async def create_indexes(cls):
        if cls.db is not None:
            try:
                await cls.db.users.create_index("email", unique=True)
                await cls.db.sessions.create_index("token", unique=True)
                logger.info("Database unique indexes created successfully.")
            except Exception as e:
                logger.warning(f"Failed to create database indexes: {e}")

    @classmethod
    def close_db(cls):
        if cls.client:
            logger.info("Closing MongoDB connection")
            cls.client.close()

db_instance = Database
