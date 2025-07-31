from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, UploadFile, File
import os
import uuid
import shutil
import aiohttp
import asyncio
import io
import concurrent.futures
import keycloak
from PIL import Image
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.websockets import WebSocketState
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
import datetime as dt
from jose import jwt, JWTError, jwk
import requests
import redis
import keycloak

from sqlalchemy import create_engine, Column, String, Text, text
from sqlalchemy import inspect
from sqlalchemy.orm import declarative_base, sessionmaker, Session

# Add parent directory to sys.path
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from env import REDIS_PASSWORD, POSTGRES_PASSWORD

# PostgreSQL setup
SQLALCHEMY_DATABASE_URL = f"postgresql://postgres:{POSTGRES_PASSWORD}@usersdb/postgres"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
current_dir = os.path.dirname(os.path.abspath(__file__))

# FastAPI app setup
app = FastAPI()
# Security scheme for JWT tokens
security = HTTPBearer()

# Database models
class DBUser(Base):
    __tablename__ = "users"
    
    username = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    display_name = Column(String)
    bio = Column(Text)
    street = Column(String)
    city = Column(String)
    state = Column(String)
    zip_code = Column(String)
    country = Column(String)

Base.metadata.create_all(bind=engine)

# Pydantic models
class UserBase(BaseModel):
    username: str
    email: str
    name: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None

class UserCreate(UserBase):
    pass

class User(UserBase):
    class Config:
        from_attributes = True

# JWT Authentication with python-jose
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    return await keycloak.verify_token(token)

# Message models and storage
class Message(BaseModel):
    text: str
    sender: str
    timestamp: datetime
    metadata: Optional[dict] = None

messages_all_languages: List[Message] = []
messages_by_language = {}

class Room(BaseModel):
    name: str
    isPublic: bool
    id: str = None

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

    # Initialize message languages
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

def get_room_key(room_id: str) -> str:
    return f"room:{room_id}"

def get_users_key(room_id: str) -> str:
    return f"room:{room_id}:users"

def get_pubsub_key(room_id: str) -> str:
    return f"room:{room_id}:pubsub"

def check_room_access(room_id: str, user_id: str) -> bool:
    """Check if user has access to room (public or invited)"""
    is_public = redis_client.hget(get_room_key(room_id), "is_public")
    if is_public and is_public.decode() == "1":
        return True
    return redis_client.sismember(get_users_key(room_id), user_id)

@app.post("/rooms")
async def create_room(room: Room, current_user: dict = Depends(get_current_user)):
    """Create a new chat room"""
    room_id = str(uuid.uuid4())
    
    # Store room data in Redis
    redis_client.hset(
        get_room_key(room_id),
        mapping={
            "id": room_id,
            "name": room.name,
            "is_public": "1" if room.isPublic else "0",
            "creator": current_user.get("sub")
        }
    )
    
    # Add creator to room's user set
    redis_client.sadd(get_users_key(room_id), current_user.get("sub"))
    
    return {"id": room_id, "name": room.name, "isPublic": room.isPublic}

@app.get("/rooms")
async def get_rooms(current_user: dict = Depends(get_current_user)):
    """Get list of public rooms + private rooms user is invited to"""
    user_id = current_user.get("sub")
    all_rooms = []
    
    # Get all room keys
    room_keys = redis_client.keys("room:*")
    for key in room_keys:
        if key.decode().endswith(":users") or key.decode().endswith(":pubsub"):
            continue
            
        room_id = key.decode().split(":")[1]
        room_data = redis_client.hgetall(key)
        if room_data:
            is_public = room_data.get(b"is_public", b"0") == b"1"
            if is_public or check_room_access(room_id, user_id):
                all_rooms.append({
                    "id": room_id,
                    "name": room_data.get(b"name", b"").decode(),
                    "is_public": is_public
                })
    
    return {"rooms": all_rooms}

@app.post("/rooms/{room_id}/join")
async def join_room(room_id: str, current_user: dict = Depends(get_current_user)):
    """Validate and add user to room"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Add user to room's Redis set
    redis_client.sadd(get_users_key(room_id), user_id)
    return {"status": "joined"}

@app.post("/rooms/{room_id}/message")
async def post_message(room_id: str, message: Message, current_user: dict = Depends(get_current_user)):
    """Post message to room"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Set message metadata
    message.user = current_user.get("preferred_username", "anonymous")
    message.timestamp = datetime.now(timezone.utc)
    
    # Publish to Redis
    redis_client.publish(get_pubsub_key(room_id), message.json())
    return {"status": "message sent"}

@app.post("/rooms/{room_id}/invite")
async def invite_user(room_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Invite user to private room"""
    # In real implementation, add owner check here
    redis_client.sadd(get_users_key(room_id), user_id)
    return {"status": "user invited"}

@app.websocket("/ws/rooms/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    client_id = None
    
    try:
        # Authentication
        data = await websocket.receive_json()
        if data.get("type") != "auth":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        try:
            payload = await keycloak.verify_token(data["token"])
            client_id = payload.get("sub")
            if not check_room_access(room_id, client_id):
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
                
            await manager.connect(websocket, client_id, room_id)
            await websocket.send_json({"type": "auth-success"})
        except Exception as e:
            await websocket.send_json({
                "type": "auth-failure",
                "message": str(e)
            })
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        while True:
            data = await websocket.receive_json()
            if data.get("type") == "message":
                await post_message(room_id, Message(**data), payload)
                
    except WebSocketDisconnect:
        if client_id:
            manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if client_id:
            manager.disconnect(client_id)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)

from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
import os
import uuid
import redis
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from jose import jwt, JWTError
import keycloak

# Redis setup
redis_client = redis.Redis(host='redis_messaging', port=6379, db=0, password=REDIS_PASSWORD)


def get_room_key(room_id: str) -> str:
    return f"room:{room_id}"

def get_users_key(room_id: str) -> str:
    return f"room:{room_id}:users"

def get_pubsub_key(room_id: str) -> str:
    return f"room:{room_id}:pubsub"

def check_room_access(room_id: str, user_id: str) -> bool:
    """Check if user has access to room (public or invited)"""
    is_public = redis_client.hget(get_room_key(room_id), "is_public")
    if is_public and is_public.decode() == "1":
        return True
    return redis_client.sismember(get_users_key(room_id), user_id)

@app.get("/rooms")
async def get_rooms(current_user: dict = Depends(get_current_user)):
    """Get list of public rooms + private rooms user is invited to"""
    user_id = current_user.get("sub")
    all_rooms = []
    
    # Get all room keys
    room_keys = redis_client.keys("room:*")
    for key in room_keys:
        if key.decode().endswith(":users") or key.decode().endswith(":pubsub"):
            continue
            
        room_id = key.decode().split(":")[1]
        room_data = redis_client.hgetall(key)
        if room_data:
            is_public = room_data.get(b"is_public", b"0") == b"1"
            if is_public or check_room_access(room_id, user_id):
                all_rooms.append({
                    "id": room_id,
                    "name": room_data.get(b"name", b"").decode(),
                    "is_public": is_public
                })
    
    return {"rooms": all_rooms}

@app.post("/rooms/{room_id}/join")
async def join_room(room_id: str, current_user: dict = Depends(get_current_user)):
    """Validate and add user to room"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Add user to room's Redis set
    redis_client.sadd(get_users_key(room_id), user_id)
    return {"status": "joined"}

@app.post("/rooms/{room_id}/message")
async def post_message(room_id: str, message: Message, current_user: dict = Depends(get_current_user)):
    """Post message to room"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Set message metadata
    message.user = current_user.get("preferred_username", "anonymous")
    message.timestamp = datetime.now(timezone.utc)
    
    # Publish to Redis
    redis_client.publish(get_pubsub_key(room_id), message.json())
    return {"status": "message sent"}

@app.post("/rooms/{room_id}/invite")
async def invite_user(room_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Invite user to private room"""
    # In real implementation, add owner check here
    redis_client.sadd(get_users_key(room_id), user_id)
    return {"status": "user invited"}

@app.websocket("/ws/rooms/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await websocket.accept()
    client_id = None
    
    try:
        # Authentication
        data = await websocket.receive_json()
        if data.get("type") != "auth":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        try:
            payload = await keycloak.verify_token(data["token"])
            client_id = payload.get("sub")
            if not check_room_access(room_id, client_id):
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
                return
                
            await manager.connect(websocket, client_id, room_id)
            await websocket.send_json({"type": "auth-success"})
        except Exception as e:
            await websocket.send_json({
                "type": "auth-failure",
                "message": str(e)
            })
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        while True:
            data = await websocket.receive_json()
            if data.get("type") == "message":
                await post_message(room_id, Message(**data), payload)
                
    except WebSocketDisconnect:
        if client_id:
            manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if client_id:
            manager.disconnect(client_id)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
