from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, UploadFile, File
import os
import uuid
import aiohttp
import asyncio
import io
import keycloak
from PIL import Image
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.websockets import WebSocketState
from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime, timezone
import requests
import base64
import redis
import keycloak

# Add parent directory to sys.path
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from env import REDIS_PASSWORD

current_dir = os.path.dirname(os.path.abspath(__file__))

# FastAPI app setup
app = FastAPI()
# Security scheme for JWT tokens
security = HTTPBearer()

# Redis setup
redis_client = redis.Redis(host='redis_messaging', port=6379, db=0, password=REDIS_PASSWORD)

# Pydantic models
class UserBase(BaseModel):
    uuid: str
    name: str
    display_name: str
    bio: Optional[str]
    street: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    country: Optional[str]


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
class Attachment(BaseModel):
    data: str  # base64 encoded
    mimeType: str

class Message(BaseModel):
    text: str
    sender: str
    timestamp: datetime
    attachments: Optional[List[Attachment]] = None
    metadata: Optional[dict] = None

messages_all_languages: List[Message] = []
messages_by_language = {}

class Room(BaseModel):
    name: str
    isPublic: bool
    id: str = None

class ConnectionManager:
    def __init__(self):
        self.room_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, client_id: str, room_id: str):
        if room_id not in self.room_connections:
            self.room_connections[room_id] = {}
        self.room_connections[room_id][client_id] = websocket

    def disconnect(self, client_id: str, room_id: str):
        if room_id in self.room_connections:
            self.room_connections[room_id].pop(client_id, None)
            if not self.room_connections[room_id]:
                del self.room_connections[room_id]

    async def broadcast(self, room_id: str, message: dict):
        connections = self.room_connections.get(room_id, {})
        for websocket in list(connections.values()):
            if websocket.client_state == WebSocketState.CONNECTED:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    print(f"Error sending to client in room {room_id}: {e}")


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

def get_user_key(uuid: str) -> str:
    return f"user:{uuid}"

@app.post("/users/", response_model=User)
def create_user(
    user: UserCreate,
    current_user: dict = Depends(get_current_user)
):
    uuid = current_user.get("sub")
    if not uuid:
        raise HTTPException(status_code=400, detail="Invalid token: missing user UUID")
    
    # Ensure UUID is set in user data
    user.uuid = uuid
    user_key = get_user_key(uuid)
    redis_client.hset(user_key, mapping=user.dict())
    return user

@app.get("/users/{uuid}", response_model=User)
def read_user(
    uuid: str,
    current_user: dict = Depends(get_current_user)
):
    user_key = get_user_key(uuid)
    user_data = redis_client.hgetall(user_key)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Convert bytes to strings
    user_dict = {k.decode(): v.decode() for k, v in user_data.items()}
    return User(**user_dict)

@app.post("/users/picture")
async def upload_profile_picture(
    picture: UploadFile = File(..., description="The image file to upload"),
    current_user: dict = Depends(get_current_user)
):
    """Upload a profile picture for the specified user.
    
    Accepts multipart/form-data with a single file field named 'picture'.
    The file must be an image (JPEG, PNG, GIF, or WebP).
    Returns the image as base64 encoded string.
    """
    # Get user UUID from auth token
    uuid = current_user.get("sub")
    if not uuid:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="No user ID found in auth token"
        )

    # Validate file is an image
    if not picture.content_type or not picture.content_type.startswith('image/'):
        raise HTTPException(
            status_code=400, 
            detail=f"File must be an image. Received content type: {picture.content_type}"
        )
        
    try:
        # Read and process image
        image_bytes = await picture.read()
        img = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if needed
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
            
        # Resize to 512x512 with padding
        img.thumbnail((512, 512))
        new_img = Image.new('RGB', (512, 512), (255, 255, 255))
        new_img.paste(img, (
            (512 - img.width) // 2,
            (512 - img.height) // 2
        ))
        
        # Convert to base64
        buffered = io.BytesIO()
        new_img.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        # Update user record in Redis
        user_key = get_user_key(uuid)
        redis_client.hset(user_key, "picture", img_str)
        
        return {"picture": img_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")

@app.put("/profile")
async def update_user(
    user_data: dict,
    current_user: dict = Depends(get_current_user)
):
    uuid = current_user.get("sub")
    if not uuid:
        raise HTTPException(status_code=400, detail="Invalid token: missing user ID")

    user_key = get_user_key(uuid)
    
    # Ensure UUID is included in the stored data
    user_data['uuid'] = uuid
    
    # Filter out None values
    filtered_data = {k: v for k, v in user_data.items() if v is not None}
    
    # Update or create the profile
    redis_client.hset(user_key, mapping=filtered_data)
    
    return {"message": "Profile updated successfully"}

@app.get("/profile")
async def get_current_user_profile(
    current_user: dict = Depends(get_current_user)
):
    """Get the profile of the currently authenticated user"""
    user_uuid = current_user.get("sub")
    if not user_uuid:
        raise HTTPException(status_code=400, detail="User UUID required")

    user_key = get_user_key(user_uuid)
    user_data = redis_client.hgetall(user_key)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    # Convert bytes to strings
    profile_data = {k.decode(): v.decode() for k, v in user_data.items()}

    # Get default image if no picture set
    default_image_path = os.path.join(current_dir, "..", "webapp", "public", "assets", "dummy-image.jpg")
    picture = profile_data.get("picture")
    if not picture and os.path.exists(default_image_path):
        with open(default_image_path, "rb") as image_file:
            picture = base64.b64encode(image_file.read()).decode("utf-8")
        profile_data["picture"] = picture

    # Return all profile fields for own profile
    return profile_data

@app.get("/profile/{user_uuid}")
async def get_profile_by_uuid(
    user_uuid: str,
    current_user: dict = Depends(get_current_user)
):
    """Get profile information for any user by their UUID"""
    if not user_uuid:
        raise HTTPException(status_code=400, detail="User UUID required")

    user_key = get_user_key(user_uuid)
    user_data = redis_client.hgetall(user_key)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    # Convert bytes to strings
    profile_data = {k.decode(): v.decode() for k, v in user_data.items()}

    # Get default image if no picture set
    default_image_path = os.path.join(current_dir, "..", "webapp", "public", "assets", "dummy-image.jpg")
    picture = profile_data.get("picture")
    if not picture and os.path.exists(default_image_path):
        with open(default_image_path, "rb") as image_file:
            picture = base64.b64encode(image_file.read()).decode("utf-8")
        profile_data["picture"] = picture

    # Return only public profile fields for other users
    return {
        "uuid": user_uuid,
        "name": profile_data.get("name"),
        "display_name": profile_data.get("display_name"),
        "bio": profile_data.get("bio"),
        "picture": profile_data.get("picture")
    }


def get_room_key(room_id: str) -> str:
    return f"room:{room_id}"

def get_users_key(room_id: str) -> str:
    return f"room:{room_id}:users"

def get_user_rooms_key(user_id: str) -> str:
    return f"user:{user_id}:rooms"

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
    user_id = current_user.get("sub")
    redis_client.sadd(get_users_key(room_id), user_id)
    
    # Add room to user's room set
    redis_client.sadd(get_user_rooms_key(user_id), room_id)
    
    return {"id": room_id, "name": room.name, "isPublic": room.isPublic}

@app.get("/user/rooms")
async def get_user_rooms(current_user: dict = Depends(get_current_user)):
    """Get rooms created by or joined by current user"""
    user_id = current_user.get("sub")
    room_ids = redis_client.smembers(get_user_rooms_key(user_id))
    
    rooms = []
    for room_id in room_ids:
        room_data = redis_client.hgetall(get_room_key(room_id.decode()))
        if room_data:
            rooms.append({
                "id": room_id.decode(),
                "name": room_data.get(b"name", b"").decode(),
                "is_public": room_data.get(b"is_public", b"0") == b"1"
            })
    
    return {"rooms": rooms}

@app.get("/rooms")
async def get_rooms(current_user: dict = Depends(get_current_user)):
    """Get list of public rooms + private rooms user is invited to"""
    user_id = current_user.get("sub")
    all_rooms = []
    
    # Get all room keys safely
    try:
        room_keys = redis_client.keys("room:*")
        for key in room_keys:
            key_str = key.decode()
            if key_str.endswith(":users") or key_str.endswith(":pubsub") or key_str.endswith(":messages"):
                continue
                
            room_id = key_str.split(":")[1]
            try:
                room_data = redis_client.hgetall(key)
                if room_data:
                    is_public = room_data.get(b"is_public", b"0") == b"1"
                    if is_public or check_room_access(room_id, user_id):
                        all_rooms.append({
                            "id": room_id,
                            "name": room_data.get(b"name", b"").decode(),
                            "is_public": is_public
                        })
            except redis.exceptions.ResponseError:
                continue  # Skip keys that aren't hashes
    except Exception as e:
        print(f"Error getting rooms: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving rooms")
    
    return {"rooms": all_rooms}

@app.post("/rooms/{room_id}/join")
async def join_room(room_id: str, current_user: dict = Depends(get_current_user)):
    """Validate and add user to room"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Add user to room's Redis set
    redis_client.sadd(get_users_key(room_id), user_id)
    # Add room to user's rooms set (like we do in create_room)
    redis_client.sadd(get_user_rooms_key(user_id), room_id)
    return {"status": "joined"}

@app.post("/rooms/{room_id}/message")
async def post_message(room_id: str, message: Message, current_user: dict = Depends(get_current_user)):
    """Post message to room"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Set message metadata if not provided
    if not message.sender:
        message.sender = current_user.get("preferred_username", "anonymous")
    if not message.timestamp:
        message.timestamp = datetime.now(timezone.utc)
    
    # Store message in Redis list (persistent storage)
    message_key = f"room:{room_id}:messages"
    redis_client.lpush(message_key, message.json())
    
    # Publish to Redis pubsub for real-time delivery
    redis_client.publish(get_pubsub_key(room_id), message.json())
    
    # Convert attachments to URLs for WebSocket clients
    if message.attachments:
        message_dict = message.dict()
        message_dict['attachments'] = [
            {'url': f"data:{att.mimeType};base64,{att.data}"}
            for att in message.attachments
        ]
    else:
        message_dict = message.dict()
    
    # Broadcast to all WebSocket connections in this room
    message_dict = message.dict()
    message_dict['timestamp'] = message_dict['timestamp'].isoformat()
    await manager.broadcast(room_id, message_dict)
    return {"status": "message sent"}

@app.get("/rooms/{room_id}/messages")
async def get_room_messages(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get messages for a room"""
    if not check_room_access(room_id, current_user.get("sub")):
        raise HTTPException(status_code=403, detail="Access denied")
    
    message_key = f"room:{room_id}:messages"
    messages = redis_client.lrange(message_key, 0, -1)
    return {
        "messages": [
            Message.parse_raw(msg.decode('utf-8')).dict() 
            for msg in messages
        ]
    }

@app.post("/rooms/{room_id}/invite")
async def invite_user(room_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Invite user to private room"""
    # In real implementation, add owner check here
    redis_client.sadd(get_users_key(room_id), user_id)
    return {"status": "user invited"}


@app.websocket("/ws/rooms/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    client_id = None

    # First send accept before any other messages
    await websocket.accept()
    
    # Then wait for auth message
    data = await websocket.receive_json()
    if data.get("type") != "auth":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    payload = await keycloak.verify_token(data["token"])
    client_id = payload.get("sub")
    if not check_room_access(room_id, client_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    await manager.connect(websocket, client_id, room_id)
    await websocket.send_json({
        "type": "auth-success",
        "message": "Authentication successful"
    })

    while True:
        data = await websocket.receive_json()
        if data.get("type") == "message":
            try:
                await post_message(room_id, Message(**data), payload)
            except Exception as e:
                print(f"Error processing message: {e}")
                
# Redis setup
redis_client = redis.Redis(host='redis_messaging', port=6379, db=0, password=REDIS_PASSWORD)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
