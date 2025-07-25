from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, UploadFile, File
import os
import uuid
import shutil
import aiohttp
import asyncio
import io
import concurrent.futures
from PIL import Image
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.websockets import WebSocketState
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
import datetime as dt
from jose import jwt, JWTError, jwk
import requests
from sqlalchemy import create_engine, Column, String, Text, text
from sqlalchemy import inspect
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import env

# PostgreSQL setup
Base = declarative_base()
current_dir = os.path.dirname(os.path.abspath(__file__))

class Message(BaseModel):
    text: str
    sender: str
    timestamp: datetime
    metadata: Optional[dict] = None

# In-memory message store
messages_all_languages: List[Message] = []
messages_by_language = {}

# Keycloak Configuration
KEYCLOAK_URL = env.KEYCLOAK_URL
KEYCLOAK_REALM = env.KEYCLOAK_REALM
ALGORITHM = "RS256"
security = HTTPBearer()

# JWKS retrieval
async def get_jwks():
    jwks_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
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
            issuer=f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
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

# FastAPI app
app = FastAPI()

# Fetch LibreTranslate languages on startup
@app.on_event("startup")
async def startup_event():
    # Verify and update database schema
    with SessionLocal() as db:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('users')]
        if 'display_name' not in columns:
            db.execute(text("ALTER TABLE users ADD COLUMN display_name VARCHAR"))
            db.commit()
            print("Added display_name column to users table")

    try:
        response = requests.get("http://libretranslate:5000/languages")
        response.raise_for_status()
        languages = [lang["code"] for lang in response.json()]
        print("Available LibreTranslate languages:", languages)
        for lang in languages:
            messages_by_language[lang] = []
    except Exception as e:
        print(f"Failed to fetch LibreTranslate languages: {e}")

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/users/", response_model=User)
def create_user(
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    db_user = DBUser(**user.dict())
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/users/{username}", response_model=User)
def read_user(
    username: str, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    db_user = db.query(DBUser).filter(DBUser.username == username).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

# Ensure images directory exists
os.makedirs("images", exist_ok=True)

@app.post("/users/picture")
async def upload_profile_picture(
    picture: UploadFile = File(..., description="The image file to upload"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Upload a profile picture for the specified user.
    
    Accepts multipart/form-data with a single file field named 'picture'.
    The file must be an image (JPEG, PNG, GIF, or WebP).
    """
    output_dir = os.path.join(current_dir, "worldchat", "images")
    print("Received file upload:", picture.filename, picture.content_type, picture.size)
    # Get username from auth token
    username = current_user.get("preferred_username")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No username found in auth token"
        )

    # Validate file is an image
    if not picture.content_type or not picture.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400, 
            detail=f"File must be an image. Received content type: {picture.content_type}"
        )
        
    # Check for common image extensions
    allowed_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
    file_ext = os.path.splitext(picture.filename.lower())[1]
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(allowed_extensions)}"
        )
    # Ensure images directory exists and is writable
    os.makedirs(output_dir, exist_ok=True)
    if not os.access(output_dir, os.W_OK):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Images directory is not writable"
        )

    # Generate random filename
    ext = os.path.splitext(picture.filename)[1]
    random_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(current_dir, "worldchat", "images", random_filename)

    # Process and save image
    try:
        # Read image with Pillow
        image_bytes = await picture.read()
        img = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed (for PNG with transparency)
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
            
        # Resize to 512x512 with padding
        img.thumbnail((512, 512))
        new_img = Image.new('RGB', (512, 512), (255, 255, 255))
        new_img.paste(img, (
            (512 - img.width) // 2,
            (512 - img.height) // 2
        ))
        
        # Save as WebP
        output = io.BytesIO()
        new_img.save(output, format='WEBP', quality=90)
        output.seek(0)
        
        # Save file
        with open(file_path, "wb") as buffer:
            buffer.write(output.read())
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")
    
    # Update user record with new picture URL
    db_user = db.query(DBUser).filter(DBUser.username == username).first()
    returl = os.path.join("images", random_filename)
    if db_user:
        db_user.picture = os.path.join(current_dir, returl) 
        db.commit()
        db.refresh(db_user)
    
    return {"pictureUrl": "/" + returl}

@app.put("/profile")
def update_user(
    username: str, 
    user: UserCreate, 
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    db_user = db.query(DBUser).filter(DBUser.username == username).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    
    for key, value in user.dict().items():
        setattr(db_user, key, value)
    
    db.commit()
    db.refresh(db_user)
    return {"message": "Profile updated"}

@app.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {"message": "Profile endpoint", "user": current_user}


async def translate_message_async(
    session: aiohttp.ClientSession,
    lang_code: str,
    source_lang: str,
    message: Message
) -> tuple[str, Message]:
    try:
        if lang_code != source_lang:
            async with session.post(
                "http://libretranslate:5000/translate",
                json={
                    "q": message.text,
                    "source": source_lang,
                    "target": lang_code
                }
            ) as response:
                response.raise_for_status()
                data = await response.json()
                translated_text = data["translatedText"]

                translated_msg = Message(
                    text=translated_text,
                    sender=message.sender,
                    timestamp=message.timestamp,
                    metadata={"original_text": message.text, "source_language": source_lang}
                )
                return lang_code, translated_msg
        else:
            return lang_code, message
    except Exception as e:
        print(f"Failed to translate message from {source_lang} to {lang_code}: {e}")
        return lang_code, None

@app.post("/messages")
async def create_message(
    message: Message,
    current_user: dict = Depends(get_current_user)
):
    # Set metadata
    message.sender = current_user.get("preferred_username", "anonymous")
    message.timestamp = datetime.now(timezone.utc)
    messages_all_languages.append(message)

    # Detect source language
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "http://libretranslate:5000/detect",
                json={"q": message.text}
            ) as detect_response:
                detect_response.raise_for_status()
                detect_data = await detect_response.json()
                source_lang = detect_data[0]["language"]

            # Translate to all languages concurrently
            tasks = [
                translate_message_async(session, lang_code, source_lang, message)
                for lang_code in messages_by_language.keys()
            ]
            results = await asyncio.gather(*tasks)

            # Save translations
            for lang_code, translated_msg in results:
                if translated_msg is not None:
                    messages_by_language[lang_code].append(translated_msg)

    except Exception as e:
        print(f"Translation flow failed: {e}")

    return {"status": "Message received and translated"}

from datetime import datetime, timezone

@app.get("/messages")
async def get_messages(since: Optional[str] = None):
    if since:
        try:
            # Handle Zulu (UTC) "Z" suffix by converting to +00:00
            if since.endswith("Z"):
                since = since.replace("Z", "+00:00")
            since_dt = datetime.fromisoformat(since)
            filtered = [msg for msg in messages_all_languages if msg.timestamp >= since_dt]
            return {"messages": filtered}
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid datetime format. Use ISO format (YYYY-MM-DDTHH:MM:SS[.ffffff][Z or [±]HH:MM])"
            )
    return {"messages": messages_all_languages}

@app.get("/languages")
async def get_languages(current_user: dict = Depends(get_current_user)):
    """Get list of available languages"""
    return {"languages": list(messages_by_language.keys())}

@app.get("/messages/{language_code}")
async def get_messages_by_language(
    language_code: str,
    since: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get messages in a specific language"""
    if language_code not in messages_by_language:
        raise HTTPException(status_code=404, detail="Language not supported")
    
    messages = messages_by_language[language_code]
    if since:
        try:
            # Handle Zulu (UTC) "Z" suffix by converting to +00:00
            if since.endswith("Z"):
                since = since.replace("Z", "+00:00")
            since_dt = datetime.fromisoformat(since)
            filtered = [msg for msg in messages if msg.timestamp >= since_dt]
            return {"messages": filtered}
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid datetime format. Use ISO format (YYYY-MM-DDTHH:MM:SS[.ffffff][Z or [±]HH:MM])"
            )
    return {"messages": messages}

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def send_initial_messages(self, websocket: WebSocket, language: str = "en"):
        if language not in messages_by_language:
            language = "en"
        messages = messages_by_language[language][-20:]  # Get last 20 messages
        await websocket.send_json({
            "type": "initial_messages",
            "messages": [msg.dict() for msg in messages]
        })

    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            if connection.client_state == WebSocketState.CONNECTED:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"Error broadcasting message: {e}")

manager = ConnectionManager()

@app.websocket("/ws/messages")
async def websocket_endpoint(websocket: WebSocket):
    # Verify WebSocket upgrade header
    if "upgrade" not in websocket.headers.get("connection", "").lower():
        await websocket.close(code=status.WS_1002_PROTOCOL_ERROR)
        return
        
    # Accept connection first
    await websocket.accept()
    client_id = None
    
    try:
        # Wait for auth message
        data = await websocket.receive_json()
        if data.get("type") != "auth":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        # Validate token
        token = data.get("token")
        if not token:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        payload = await verify_token(token)
        client_id = payload.get("sub") or str(uuid.uuid4())
        
        # Send auth confirmation
        await websocket.send_json({"type": "auth-success"})
        
        # Send initial messages
        language = websocket.headers.get("accept-language", "en")
        await manager.send_initial_messages(websocket, language)
        
        while True:
            data = await websocket.receive_json()
            
            if data.get("type") == "message":
                # Create and store the message
                message = Message(
                    text=data["text"],
                    sender=payload.get("preferred_username", "anonymous"),
                    timestamp=datetime.now(timezone.utc)
                )
                
                # Add to all languages store
                messages_all_languages.append(message)
                
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(client_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
