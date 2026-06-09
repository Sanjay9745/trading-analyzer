import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import SESSION_LIFETIME_DAYS
from db import db_instance

security_bearer = HTTPBearer(auto_error=False)

def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """
    Hashes a password with a SHA-256 algorithm and a unique salt.
    Returns (hashed_password, salt).
    """
    if not salt:
        salt = secrets.token_hex(16)
    
    # Simple, secure SHA-256 hashing with salt
    hash_obj = hashlib.sha256((password + salt).encode('utf-8'))
    hashed_password = hash_obj.hexdigest()
    return hashed_password, salt

def verify_password(password: str, salt: str, hashed_password: str) -> bool:
    """
    Verifies that a password matches its hashed form.
    """
    expected_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(expected_hash, hashed_password)

def generate_token() -> str:
    """
    Generates a secure random session token.
    """
    return secrets.token_hex(32)

async def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Security(security_bearer)) -> dict:
    """
    Retrieves the current logged in user based on the Authorization Bearer header.
    Throws HTTP 401 if missing, expired, or invalid.
    """
    token = None
    if credentials:
        token = credentials.credentials
    else:
        # Fallback to check standard custom header x-session-token
        token = request.headers.get("x-session-token")
        
    if not token:
        raise HTTPException(status_code=401, detail="Authentication credentials missing")
        
    db = db_instance.db
    if db is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    # Look up session
    session = await db.sessions.find_one({"token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session token")
        
    # Check expiration
    if session.get("expires_at") < datetime.utcnow():
        # Clean up expired session
        await db.sessions.delete_one({"token": token})
        raise HTTPException(status_code=401, detail="Session expired")
        
    # Look up user
    user = await db.users.find_one({"email": session.get("email")})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
        
    return user
