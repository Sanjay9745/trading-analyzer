import os
import json
import logging
import redis.asyncio as aioredis
from config import REDIS_URL, CACHE_EXPIRE_SECONDS

logger = logging.getLogger(__name__)

class RedisCache:
    client = None
    is_connected = False

    @classmethod
    async def connect(cls):
        try:
            logger.info(f"Connecting to Redis at {REDIS_URL}")
            cls.client = aioredis.from_url(REDIS_URL, decode_responses=True)
            # Ping redis to verify active connection immediately
            await cls.client.ping()
            cls.is_connected = True
            logger.info("Redis connection established successfully. Cache layer active.")
        except Exception as e:
            logger.warning(f"Redis server is offline or unreachable. Caching disabled. Details: {e}")
            cls.client = None
            cls.is_connected = False

    @classmethod
    async def get(cls, key: str) -> dict | None:
        if not cls.client or not cls.is_connected:
            return None
        try:
            data = await cls.client.get(key)
            if data:
                return json.loads(data)
        except Exception as e:
            logger.warning(f"Failed to get key {key} from Redis: {e}. Falling back to database.")
            # Disconnect to fallback gracefully on runtime Redis loss
            cls.is_connected = False
        return None

    @classmethod
    async def set(cls, key: str, value: dict, expire: int = CACHE_EXPIRE_SECONDS):
        if not cls.client or not cls.is_connected:
            return
        try:
            await cls.client.set(key, json.dumps(value), ex=expire)
        except Exception as e:
            logger.warning(f"Failed to set key {key} in Redis: {e}.")
            cls.is_connected = False

    @classmethod
    async def delete(cls, key: str):
        if not cls.client or not cls.is_connected:
            return
        try:
            await cls.client.delete(key)
        except Exception as e:
            logger.warning(f"Failed to delete key {key} from Redis: {e}.")
            cls.is_connected = False

    @classmethod
    async def disconnect(cls):
        if cls.client:
            logger.info("Closing Redis connection")
            try:
                await cls.client.close()
            except Exception:
                pass
            cls.client = None
            cls.is_connected = False

redis_cache = RedisCache
