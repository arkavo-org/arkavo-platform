from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, UploadFile, File
import os
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, jwk
import requests
from sqlalchemy.orm import declarative_base, sessionmaker, Session

from env import VITE_KEYCLOAK_SERVER_URL, KEYCLOAK_REALM, KEYCLOAK_AUTH_URL

# PostgreSQL setup
Base = declarative_base()
current_dir = os.path.dirname(os.path.abspath(__file__))

# Keycloak Configuration
ALGORITHM = "RS256"
security = HTTPBearer()

# JWKS retrieval
async def get_jwks():
    jwks_url = f"{VITE_KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
    response = requests.get(jwks_url)
    response.raise_for_status()
    return response.json()

# Token verification helper
async def verify_token(token: str) -> dict:
    """Verify JWT token and return payload if valid"""
    try:
        jwks = await get_jwks()
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        key = next((k for k in jwks["keys"] if k["kid"] == kid), None)
        if not key:
            raise JWTError("Public key not found in JWKS")

        public_key = jwk.construct(key)
        payload = jwt.decode(
            token,
            key=public_key.to_pem().decode("utf-8"),
            algorithms=[ALGORITHM],
            audience="account",
            issuer=f"{KEYCLOAK_AUTH_URL}/realms/{KEYCLOAK_REALM}"
        )
        print(f"Token verified for user: {payload.get('preferred_username')}")
        return payload
    except JWTError as e:
        print(f"Token verification failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

# JWT Authentication with python-jose
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    return await verify_token(token)
