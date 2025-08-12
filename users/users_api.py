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
from typing import Optional, List, Dict, Union
from datetime import datetime, timezone
import requests
import json
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

# JWT Authentication with python-jose
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    return await keycloak.verify_token(token)

messages_all_languages: List[Dict] = []
messages_by_language = {}

class ConnectionManager:
    def __init__(self):
        self.client_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        print(f"Client {client_id} connected")
        self.client_connections[client_id] = websocket

    def disconnect(self, client_id: str):
        if client_id in self.client_connections:
            self.client_connections.pop(client_id, None)

    async def broadcast(self, room_id: str, message: Dict):
        # Get all users in this room from Redis
        room_users_key = f"room:{room_id}:users"
        user_ids = [uid.decode() for uid in redis_client.smembers(room_users_key)]
        print(f"Broadcasting message to room {room_id} users: {user_ids}")
        print(f"Current connections: {self.client_connections.keys()}")
        
        # Send message to all connected users in the room
        for user_id in user_ids:
            if user_id in self.client_connections:
                websocket = self.client_connections[user_id]
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_json(message)
                    except WebSocketDisconnect:
                        self.disconnect(user_id)


manager = ConnectionManager()

async def translate_message_async(
    session: aiohttp.ClientSession,
    lang_code: str,
    source_lang: str,
    message: Dict
) -> tuple[str, Dict]:
    og_text = message['text']
    if lang_code != source_lang:
        async with session.post(
            "http://libretranslate:5000/translate",
            json={
                "q": og_text,
                "source": source_lang,
                "target": lang_code
            }
        ) as response:
            response.raise_for_status()
            data = await response.json()
            translated_text = data["translatedText"]

            message['text'] = translated_text
            message["metadata"] = {"original_content": og_text, "source_language": source_lang}
            return lang_code, message
    else:
        return lang_code, message


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

@app.post("/users/", response_model=Dict)
def create_user(
    user: Dict,
    current_user: dict = Depends(get_current_user)
):
    uuid = current_user.get("sub")
    if not uuid:
        raise HTTPException(status_code=400, detail="Invalid token: missing user UUID")
    
    # Ensure UUID is set in user data
    user["uuid"] = uuid
    user_key = get_user_key(uuid)
    redis_client.hset(user_key, mapping=user)
    return user

@app.get("/users/{uuid}", response_model=Dict)
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
    return user_dict

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
    
    # Filter out None values but keep empty strings
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

def get_admins_key(room_id: str) -> str:
    return f"room:{room_id}:admins"

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
async def get_rooms(current_user: list = Depends(get_current_user)):
    """Get list of public rooms + private rooms user is invited to"""
    user_id = current_user.get("sub")
    all_rooms = []
    
    # Get all room keys safely
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
    
    return all_rooms

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
async def post_message(room_id: str, message: dict, current_user: dict = Depends(get_current_user)):
    """Post message to room - handles all message types uniformly"""
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Parse content if it's a string
    if isinstance(message.get('content'), str):
        try:
            message['content'] = json.loads(message['content'])
        except json.JSONDecodeError:
            pass  # Keep as string if not valid JSON

    # Enforce server-controlled fields
    message.update({
        "sender": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "roomId": room_id  # Ensure roomId is included for WebSocket routing
    })
    
    # Store message in Redis list (persistent storage)
    message_key = f"room:{room_id}:messages"
    redis_client.lpush(message_key, json.dumps(message))
    
    # Publish to Redis pubsub for real-time delivery
    pubsub_key = get_pubsub_key(room_id)
    message_json = json.dumps(message)
    print(f"Publishing message to Redis channel {pubsub_key}: {message_json}")
    redis_client.publish(pubsub_key, message_json)
    
    # Broadcast to all WebSocket connections in this room
    print(f"Broadcasting to WebSocket connections for room {room_id}")
    await manager.broadcast(room_id, message)
    print("Broadcast complete")
    return {"status": "message sent"}

@app.put("/rooms/{room_id}")
async def update_room(
    room_id: str,
    room_update: dict,
    current_user: dict = Depends(get_current_user)
):
    """Update room information"""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    
    # Check if user is admin of this room
    if not redis_client.sismember(get_admins_key(room_id), user_id):
        raise HTTPException(status_code=403, detail="Only admins can update room settings")

    print(f"Updating room {room_id} with data: {room_update}")  # Debug log

    # Update room data in Redis
    redis_client.hset(
        get_room_key(room_id),
        mapping=room_update
    )
    
    # Verify the update was successful
    updated_data = redis_client.hgetall(get_room_key(room_id))
    print(f"Room data after update: {updated_data}")  # Debug log
    
    return {"status": "room updated"}

@app.get("/rooms/{room_id}")
async def get_room(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get details for a specific room, auto-creating DM rooms if needed"""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    room_key = get_room_key(room_id)

    # Check if room exists, if not create it
    if not redis_client.exists(room_key):
        print(f"Creating new room: {room_id}")  # Debug log
        is_dm = "_" in room_id
        if is_dm:
            admins = list(set(room_id.split("_")))  # Remove duplicates
        else:
            admins = [user_id]
        
        # Create regular room
        new_room = {
            "id": room_id,
            "name": f"Room {room_id[:8]}",
            "is_public": 0,
            "creator": user_id
        }
        redis_client.hset(room_key, mapping=new_room)
        
        # For DM rooms, add both users as members and admins
        for user in admins:  # admins contains both users for DM rooms
            redis_client.sadd(get_users_key(room_id), user)
            redis_client.sadd(get_user_rooms_key(user), room_id)
            redis_client.sadd(get_admins_key(room_id), user)
    
    # Check if user has access to the room
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get room data from Redis and convert bytes to strings
    room_data = redis_client.hgetall(room_key)
    room_dict = {k.decode(): v.decode() for k, v in room_data.items()}
    
    # Get list of admin user IDs
    admin_ids = redis_client.smembers(get_admins_key(room_id))
    admins = [admin_id.decode() for admin_id in admin_ids] if admin_ids else []
    
    return {
        "id": room_id,
        "name": room_dict.get("name"),
        "is_public": int(room_dict.get("is_public", 0)),
        "creator": room_dict.get("creator"),
        "admins": admins
    }

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
    parsed_messages = []
    
    for msg in messages:
        try:
            msg_data = json.loads(msg.decode('utf-8'))
            parsed_messages.append(msg_data)
        except Exception as e:
            print(f"Error parsing message: {e}")
            continue
            
    return {"messages": parsed_messages}

@app.post("/rooms/{room_id}/invite")
async def invite_user(room_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Invite user to private room"""
    # In real implementation, add owner check here
    redis_client.sadd(get_users_key(room_id), user_id)
    return {"status": "user invited"}


@app.websocket("/ws") 
async def websocket_endpoint(websocket: WebSocket):
    print("WebSocket connection established")
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
        
    await manager.connect(websocket, client_id)
    await websocket.send_json({
        "type": "auth-success", 
        "message": "Authentication successful"
    })

    while True:
        try:
            data = await websocket.receive_json()
            if data.get("type") == "disconnect":
                await manager.disconnect(client_id)
                await websocket.close()
                return
        except WebSocketDisconnect:
            await manager.disconnect(client_id)
            return

if __name__ == "__main__": 
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
