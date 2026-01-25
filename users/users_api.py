from fastapi import FastAPI, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, UploadFile, File
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
import os
import uuid
import aiohttp
import asyncio
import io
import keycloak
from PIL import Image
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.websockets import WebSocketState
from typing import Optional, List, Dict, Union, Any
from datetime import datetime, timezone
import requests
import json
import base64
import redis
import keycloak 

# Add parent directory to sys.path 
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from env import (
    REDIS_PASSWORD,
    KEYCLOAK_AUTH_URL,
    KEYCLOAK_INTERNAL_AUTH_URL,
    KEYCLOAK_REALM,
    KEYCLOAK_ADMIN,
    KEYCLOAK_ADMIN_PASSWORD,
    ADMIN_CLIENT,
)

current_dir = os.path.dirname(os.path.abspath(__file__))

# FastAPI app setup
app = FastAPI()
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")
# Security scheme for JWT tokens
security = HTTPBearer()

# Redis setup
redis_client = redis.Redis(host='redis_messaging', port=6379, db=0, password=REDIS_PASSWORD)

# JWT Authentication with python-jose
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = await keycloak.verify_token(token)
    sync_profile_from_token(payload)
    return payload

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

def sync_profile_from_token(payload: Dict[str, Any]) -> None:
    user_id = payload.get("sub")
    if not user_id:
        return
    user_key = get_user_key(user_id)
    if redis_client.exists(user_key):
        return

    given = (payload.get("given_name") or "").strip()
    family = (payload.get("family_name") or "").strip()
    full_name = " ".join(part for part in [given, family] if part).strip()
    preferred_username = (payload.get("preferred_username") or "").strip()
    name = (payload.get("name") or "").strip()
    display_name = name or full_name or preferred_username or "Unknown user"

    profile = {
        "uuid": user_id,
        "name": name or preferred_username or display_name,
        "display_name": display_name,
    }
    email = payload.get("email")
    if email:
        profile["email"] = email
    picture = payload.get("picture")
    if picture:
        profile["picture"] = picture

    redis_client.hset(user_key, mapping=profile)

def get_notifications_key(user_id: str) -> str:
    return f"user:{user_id}:notifications"

def add_notification(user_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    notification_id = str(uuid.uuid4())
    notification = {
        **payload,
        "id": notification_id,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    redis_client.hset(
        get_notifications_key(user_id),
        notification_id,
        json.dumps(notification)
    )
    return notification

def get_keycloak_admin_token() -> str:
    auth_base = KEYCLOAK_INTERNAL_AUTH_URL or KEYCLOAK_AUTH_URL
    token_url = f"{auth_base}/realms/master/protocol/openid-connect/token"
    data = {
        "client_id": ADMIN_CLIENT,
        "username": KEYCLOAK_ADMIN,
        "password": KEYCLOAK_ADMIN_PASSWORD,
        "grant_type": "password",
    }
    response = requests.post(token_url, data=data)
    if not response.ok:
        raise HTTPException(
            status_code=502,
            detail="Failed to authenticate with Keycloak admin",
        )
    token = response.json().get("access_token")
    if not token:
        raise HTTPException(
            status_code=502,
            detail="Missing Keycloak admin access token",
        )
    return token

def get_profile_summary(user_uuid: str) -> Dict[str, Optional[str]]:
    user_key = get_user_key(user_uuid)
    user_data = redis_client.hgetall(user_key)
    if not user_data:
        return {
            "uuid": user_uuid,
            "name": "[deleted]",
            "display_name": "[deleted]",
            "picture": None
        }

    profile_data = {k.decode(): v.decode() for k, v in user_data.items()}
    display_name = (
        profile_data.get("display_name")
        or profile_data.get("name")
        or "Unknown user"
    )

    return {
        "uuid": user_uuid,
        "name": profile_data.get("name"),
        "display_name": display_name,
        "picture": profile_data.get("picture")
    }

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
    profile_data = {k.decode(): v.decode() for k, v in user_data.items()} if user_data else {}

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
        return {
            "uuid": user_uuid,
            "name": "[deleted]",
            "display_name": "[deleted]",
            "bio": None,
            "picture": None
        }

    profile_data = {k.decode(): v.decode() for k, v in user_data.items()}

    # Get default image if no picture set
    default_image_path = os.path.join(current_dir, "..", "webapp", "public", "assets", "dummy-image.jpg")
    picture = profile_data.get("picture")
    if not picture and os.path.exists(default_image_path):
        with open(default_image_path, "rb") as image_file:
            picture = base64.b64encode(image_file.read()).decode("utf-8")
        profile_data["picture"] = picture

    # Return only public profile fields for other users
    display_name = (
        profile_data.get("display_name")
        or profile_data.get("name")
        or "Unknown user"
    )

    return {
        "uuid": user_uuid,
        "name": profile_data.get("name"),
        "display_name": display_name,
        "bio": profile_data.get("bio"),
        "picture": profile_data.get("picture")
    }

@app.delete("/users/{uuid}")
async def delete_user(
    uuid: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete the currently authenticated user's profile and notifications."""
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=400, detail="Invalid token: missing user ID")
    if requester_id != uuid:
        raise HTTPException(status_code=403, detail="Cannot delete another user")

    admin_token = get_keycloak_admin_token()
    auth_base = KEYCLOAK_INTERNAL_AUTH_URL or KEYCLOAK_AUTH_URL
    keycloak_user_url = f"{auth_base}/admin/realms/{KEYCLOAK_REALM}/users/{uuid}"
    kc_response = requests.delete(
        keycloak_user_url,
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    if kc_response.status_code not in (204, 404):
        raise HTTPException(
            status_code=502,
            detail="Failed to delete Keycloak account",
        )

    user_key = get_user_key(uuid)
    notifications_key = get_notifications_key(uuid)
    user_rooms_key = get_user_rooms_key(uuid)
    user_blocks_key = get_user_blocks_key(uuid)
    room_ids = [room_id.decode() for room_id in redis_client.smembers(user_rooms_key)]

    for room_id in room_ids:
        room_key = get_room_key(room_id)
        room_data = redis_client.hgetall(room_key)
        is_public = room_data.get(b"is_public", b"0") == b"1" if room_data else False
        is_dm = "_" in room_id

        if is_dm or not is_public:
            member_ids = redis_client.smembers(get_users_key(room_id))
            for member in member_ids:
                member_id = member.decode()
                redis_client.srem(get_user_rooms_key(member_id), room_id)

            redis_client.delete(
                room_key,
                get_users_key(room_id),
                get_admins_key(room_id),
                f"room:{room_id}:messages",
                get_pubsub_key(room_id),
            )
        else:
            redis_client.srem(get_users_key(room_id), uuid)
            redis_client.srem(get_admins_key(room_id), uuid)
            redis_client.srem(user_rooms_key, room_id)

    redis_client.delete(user_rooms_key)
    redis_client.delete(user_key)
    redis_client.delete(notifications_key)
    redis_client.delete(user_blocks_key)

    for key in redis_client.scan_iter("user:*:blocked"):
        redis_client.srem(key, uuid)

    reports_key = get_reports_key()
    if redis_client.exists(reports_key):
        reports = redis_client.lrange(reports_key, 0, -1)
        retained = []
        for report in reports:
            try:
                report_data = json.loads(report.decode("utf-8"))
            except Exception:
                continue
            if report_data.get("reporter_id") == uuid:
                continue
            if report_data.get("target_id") == uuid:
                continue
            retained.append(json.dumps(report_data))
        redis_client.delete(reports_key)
        if retained:
            redis_client.rpush(reports_key, *retained)

    return {"message": "User deleted"}

@app.post("/users/{target_id}/block")
async def block_user(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    if requester_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")

    redis_client.sadd(get_user_blocks_key(requester_id), target_id)
    return {"status": "blocked"}

@app.delete("/users/{target_id}/block")
async def unblock_user(
    target_id: str,
    current_user: dict = Depends(get_current_user)
):
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    if requester_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot unblock yourself")

    redis_client.srem(get_user_blocks_key(requester_id), target_id)
    return {"status": "unblocked"}

@app.post("/users/{target_id}/report")
async def report_user(
    target_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    if requester_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot report yourself")

    report = {
        "id": str(uuid.uuid4()),
        "reporter_id": requester_id,
        "target_id": target_id,
        "room_id": payload.get("room_id"),
        "reason": payload.get("reason"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    redis_client.rpush(get_reports_key(), json.dumps(report))
    return {"status": "reported"}

@app.get("/people")
async def list_people(current_user: dict = Depends(get_current_user)):
    """Return a list of all user profiles for discovery."""
    people = []
    try:
        for key in redis_client.scan_iter("user:*"):
            key_str = key.decode()
            if key_str.endswith(":rooms"):
                continue
            # Skip nested keys like user:{id}:something
            if key_str.count(":") != 1:
                continue

            user_uuid = key_str.split(":")[1]
            user_data = redis_client.hgetall(key)
            if not user_data:
                profile_data = {
                    "name": user_uuid,
                    "display_name": user_uuid,
                    "bio": "",
                    "picture": None
                }
            else:
                profile_data = {k.decode(): v.decode() for k, v in user_data.items()}
            display_name = (
                profile_data.get("display_name")
                or profile_data.get("name")
                or user_uuid
            )
            people.append({
                "uuid": user_uuid,
                "name": profile_data.get("name"),
                "display_name": display_name,
                "bio": profile_data.get("bio"),
                "picture": profile_data.get("picture")
            })
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch people") from exc

    return {"people": people}

def get_room_key(room_id: str) -> str:
    return f"room:{room_id}"

def get_users_key(room_id: str) -> str:
    return f"room:{room_id}:users"

def get_admins_key(room_id: str) -> str:
    return f"room:{room_id}:admins"

def get_user_rooms_key(user_id: str) -> str:
    return f"user:{user_id}:rooms"

def get_orgs_key() -> str:
    return "orgs"

def get_org_key(org_id: str) -> str:
    return f"org:{org_id}"

def get_org_rooms_key(org_id: str) -> str:
    return f"org:{org_id}:rooms"

def get_org_events_key(org_id: str) -> str:
    return f"org:{org_id}:events"

def get_pubsub_key(room_id: str) -> str:
    return f"room:{room_id}:pubsub"

def get_user_blocks_key(user_id: str) -> str:
    return f"user:{user_id}:blocked"

def get_reports_key() -> str:
    return "reports"

def check_room_access(room_id: str, user_id: str) -> bool:
    """Check if user has access to room (public or invited)"""
    is_public = redis_client.hget(get_room_key(room_id), "is_public")
    if is_public and is_public.decode() == "1":
        return True
    return redis_client.sismember(get_users_key(room_id), user_id)

@app.post("/orgs")
async def create_org(payload: dict, current_user: dict = Depends(get_current_user)):
    """Create an organization with optional rooms and events."""
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Organization name is required")

    org_id = str(uuid.uuid4())
    slug = (payload.get("slug") or name).strip().lower().replace(" ", "-")
    url = (payload.get("url") or "").strip()
    owner = current_user.get("sub")
    created_at = datetime.now(timezone.utc).isoformat()

    redis_client.hset(
        get_org_key(org_id),
        mapping={
            "name": name,
            "slug": slug,
            "url": url,
            "owner": owner,
            "created_at": created_at,
        },
    )
    redis_client.sadd(get_orgs_key(), org_id)

    rooms = payload.get("rooms") or []
    if isinstance(rooms, list):
        for room_id in rooms:
            if isinstance(room_id, str) and room_id.strip():
                redis_client.sadd(get_org_rooms_key(org_id), room_id.strip())

    events = payload.get("events") or []
    if isinstance(events, list):
        for event in events:
            if isinstance(event, dict):
                redis_client.rpush(get_org_events_key(org_id), json.dumps(event))
            elif isinstance(event, str) and event.strip():
                redis_client.rpush(
                    get_org_events_key(org_id),
                    json.dumps({"title": event.strip()}),
                )

    return {
        "id": org_id,
        "name": name,
        "slug": slug,
        "url": url,
        "rooms": [
            room_id.decode()
            for room_id in redis_client.smembers(get_org_rooms_key(org_id))
        ],
        "events": events,
    }


@app.get("/orgs")
async def get_orgs(current_user: dict = Depends(get_current_user)):
    """List organizations."""
    org_ids = [org_id.decode() for org_id in redis_client.smembers(get_orgs_key())]
    orgs = []
    for org_id in org_ids:
        data = redis_client.hgetall(get_org_key(org_id))
        if not data:
            continue
        orgs.append(
            {
                "id": org_id,
                "name": data.get(b"name", b"").decode(),
                "slug": data.get(b"slug", b"").decode(),
                "url": data.get(b"url", b"").decode() or None,
            }
        )
    return {"orgs": orgs}


@app.get("/orgs/{org_id}")
async def get_org(org_id: str, current_user: dict = Depends(get_current_user)):
    """Get organization details."""
    data = redis_client.hgetall(get_org_key(org_id))
    if not data:
        raise HTTPException(status_code=404, detail="Organization not found")

    rooms = [
        room_id.decode()
        for room_id in redis_client.smembers(get_org_rooms_key(org_id))
    ]
    event_items = [
        json.loads(item.decode())
        for item in redis_client.lrange(get_org_events_key(org_id), 0, -1)
    ]

    return {
        "id": org_id,
        "name": data.get(b"name", b"").decode(),
        "slug": data.get(b"slug", b"").decode(),
        "url": data.get(b"url", b"").decode() or None,
        "owner": data.get(b"owner", b"").decode(),
        "created_at": data.get(b"created_at", b"").decode(),
        "rooms": rooms,
        "events": event_items,
    }


@app.post("/orgs/{org_id}/rooms")
async def add_org_room(
    org_id: str, payload: dict, current_user: dict = Depends(get_current_user)
):
    """Add a room to an organization."""
    room_id = (payload.get("room_id") or payload.get("roomId") or "").strip()
    if not room_id:
        raise HTTPException(status_code=400, detail="room_id is required")

    if not redis_client.exists(get_org_key(org_id)):
        raise HTTPException(status_code=404, detail="Organization not found")

    redis_client.sadd(get_org_rooms_key(org_id), room_id)
    return {"status": "ok", "room_id": room_id}


@app.post("/orgs/{org_id}/events")
async def add_org_event(
    org_id: str, payload: dict, current_user: dict = Depends(get_current_user)
):
    """Add an event to an organization."""
    if not redis_client.exists(get_org_key(org_id)):
        raise HTTPException(status_code=404, detail="Organization not found")

    if not isinstance(payload, dict) or not payload:
        raise HTTPException(status_code=400, detail="Event payload is required")

    redis_client.rpush(get_org_events_key(org_id), json.dumps(payload))
    return {"status": "ok"}

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

@app.post("/rooms")
async def create_room(payload: dict, current_user: dict = Depends(get_current_user)):
    """Create a room and add the creator as member/admin."""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Room name is required")

    room_id = (payload.get("id") or payload.get("room_id") or "").strip()
    if not room_id:
        room_id = str(uuid.uuid4())

    room_key = get_room_key(room_id)
    if redis_client.exists(room_key):
        raise HTTPException(status_code=409, detail="Room already exists")

    is_public = 1 if payload.get("is_public") else 0

    new_room = {
        "id": room_id,
        "name": name,
        "is_public": is_public,
        "creator": user_id,
    }
    redis_client.hset(room_key, mapping=new_room)
    redis_client.sadd(get_users_key(room_id), user_id)
    redis_client.sadd(get_user_rooms_key(user_id), room_id)
    redis_client.sadd(get_admins_key(room_id), user_id)

    return {
        "id": room_id,
        "name": name,
        "is_public": bool(is_public),
    }

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

    content_uuid = message.get("content_uuid")
    if not content_uuid and isinstance(message.get("content"), str):
        trimmed = message["content"].strip()
        if not trimmed.startswith("TDF"):
            try:
                parsed = json.loads(trimmed)
                content_uuid = parsed.get("uuid")
            except json.JSONDecodeError:
                content_uuid = None

    # Enforce server-controlled fields
    message.update({
        "sender": user_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "roomId": room_id,  # Ensure roomId is included for WebSocket routing
        "content_uuid": content_uuid
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

@app.delete("/rooms/{room_id}")
async def delete_dm_room(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a direct message room for all participants."""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")
    if "_" not in room_id:
        raise HTTPException(status_code=400, detail="Only direct message rooms can be deleted")

    if not redis_client.sismember(get_users_key(room_id), user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    member_ids = redis_client.smembers(get_users_key(room_id))
    for member in member_ids:
        member_id = member.decode()
        redis_client.srem(get_user_rooms_key(member_id), room_id)

    redis_client.delete(
        get_room_key(room_id),
        get_users_key(room_id),
        get_admins_key(room_id),
        f"room:{room_id}:messages",
        get_pubsub_key(room_id),
    )
    return {"status": "room deleted"}

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

def find_message_index(room_id: str, message_id: str) -> Optional[Dict[str, Any]]:
    message_key = f"room:{room_id}:messages"
    messages = redis_client.lrange(message_key, 0, -1)
    for index, msg in enumerate(messages):
        try:
            msg_data = json.loads(msg.decode("utf-8"))
        except Exception:
            continue
        if msg_data.get("content_uuid") == message_id:
            return {"index": index, "message": msg_data}
        content = msg_data.get("content")
        if isinstance(content, str):
            trimmed = content.strip()
            if not trimmed.startswith("TDF"):
                try:
                    parsed = json.loads(trimmed)
                except json.JSONDecodeError:
                    parsed = None
                if parsed and parsed.get("uuid") == message_id:
                    return {"index": index, "message": msg_data}
    return None

@app.patch("/rooms/{room_id}/messages/{message_id}")
async def edit_room_message(
    room_id: str,
    message_id: str,
    payload: dict,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    result = find_message_index(room_id, message_id)
    if not result:
        raise HTTPException(status_code=404, detail="Message not found")

    msg_data = result["message"]
    if msg_data.get("sender") != user_id:
        raise HTTPException(status_code=403, detail="Cannot edit another user's message")

    new_content = payload.get("content")
    if new_content is None:
        raise HTTPException(status_code=400, detail="Missing content")

    msg_data["content"] = new_content
    msg_data["content_uuid"] = message_id
    msg_data["edited_at"] = datetime.now(timezone.utc).isoformat()

    message_key = f"room:{room_id}:messages"
    redis_client.lset(message_key, result["index"], json.dumps(msg_data))

    await manager.broadcast(
        room_id,
        {
            "type": "message_edit",
            "roomId": room_id,
            "message_id": message_id,
            "content": new_content,
            "sender": user_id,
            "edited_at": msg_data["edited_at"],
        },
    )
    return {"status": "message updated"}

@app.delete("/rooms/{room_id}/messages/{message_id}")
async def delete_room_message(
    room_id: str,
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("sub")
    if not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    result = find_message_index(room_id, message_id)
    if not result:
        raise HTTPException(status_code=404, detail="Message not found")

    msg_data = result["message"]
    if msg_data.get("sender") != user_id:
        raise HTTPException(status_code=403, detail="Cannot delete another user's message")

    message_key = f"room:{room_id}:messages"
    tombstone = json.dumps({"_deleted": True, "content_uuid": message_id})
    redis_client.lset(message_key, result["index"], tombstone)
    redis_client.lrem(message_key, 1, tombstone)

    await manager.broadcast(
        room_id,
        {
            "type": "message_delete",
            "roomId": room_id,
            "message_id": message_id,
            "sender": user_id,
        },
    )
    return {"status": "message deleted"}

@app.get("/rooms/{room_id}/members")
async def get_room_members(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Return list of room members with basic profile details"""
    user_id = current_user.get("sub")
    if not user_id or not check_room_access(room_id, user_id):
        raise HTTPException(status_code=403, detail="Access denied")

    member_ids = redis_client.smembers(get_users_key(room_id))
    members = []
    for member in member_ids:
        user_uuid = member.decode()
        members.append(get_profile_summary(user_uuid))

    return {"members": members}

@app.post("/rooms/{room_id}/invite")
async def invite_user(room_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Invite user to private room"""
    # In real implementation, add owner check here
    redis_client.sadd(get_users_key(room_id), user_id)
    redis_client.sadd(get_user_rooms_key(user_id), room_id)

    # Add notification for invited user
    room_data = redis_client.hgetall(get_room_key(room_id))
    room_name = room_data.get(b"name", b"").decode() if room_data else room_id
    inviter = current_user.get("sub")
    if inviter:
        notification = add_notification(
            user_id,
            {
                "type": "room_invite",
                "room_id": room_id,
                "room_name": room_name,
                "invited_by": inviter,
            },
        )
        await manager.send_to_user(
            user_id,
            {
                "type": "notification",
                "notification": notification,
            },
        )
    return {"status": "user invited"}

@app.delete("/rooms/{room_id}/members/{member_id}")
async def remove_room_member(
    room_id: str,
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Allow room admins to remove members from the room"""
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    if not redis_client.sismember(get_admins_key(room_id), requester_id):
        raise HTTPException(status_code=403, detail="Only admins can remove members")

    redis_client.srem(get_users_key(room_id), member_id)
    redis_client.srem(get_user_rooms_key(member_id), room_id)
    redis_client.srem(get_admins_key(room_id), member_id)
    return {"status": "member removed"}

@app.post("/rooms/{room_id}/admins/{member_id}")
async def promote_room_admin(
    room_id: str,
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    if not redis_client.sismember(get_admins_key(room_id), requester_id):
        raise HTTPException(status_code=403, detail="Only admins can update admins")

    if not redis_client.sismember(get_users_key(room_id), member_id):
        raise HTTPException(status_code=400, detail="User is not in the room")

    redis_client.sadd(get_admins_key(room_id), member_id)
    return {"status": "admin added"}

@app.delete("/rooms/{room_id}/admins/{member_id}")
async def demote_room_admin(
    room_id: str,
    member_id: str,
    current_user: dict = Depends(get_current_user)
):
    requester_id = current_user.get("sub")
    if not requester_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    if not redis_client.sismember(get_admins_key(room_id), requester_id):
        raise HTTPException(status_code=403, detail="Only admins can update admins")

    if member_id == requester_id:
        raise HTTPException(status_code=400, detail="Cannot demote yourself")

    redis_client.srem(get_admins_key(room_id), member_id)
    return {"status": "admin removed"}

@app.get("/notifications")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    """Return notifications for the current user"""
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    notifications_data = redis_client.hgetall(get_notifications_key(user_id))
    notifications = []
    for notification_id, payload in notifications_data.items():
        try:
            notification = json.loads(payload.decode())
            notifications.append(notification)
        except json.JSONDecodeError:
            continue

    # Sort newest first
    notifications.sort(key=lambda n: n.get("timestamp", ""), reverse=True)

    return {"notifications": notifications}

@app.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user.get("sub")
    if not user_id:
        raise HTTPException(status_code=403, detail="Not authenticated")

    redis_client.hdel(get_notifications_key(user_id), notification_id)
    return {"status": "notification dismissed"}


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
                manager.disconnect(client_id)
                await websocket.close()
                return
        except WebSocketDisconnect:
            manager.disconnect(client_id)
            return

if __name__ == "__main__": 
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
    async def send_to_user(self, user_id: str, payload: Dict[str, Any]):
        websocket = self.client_connections.get(user_id)
        if websocket and websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.send_json(payload)
            except WebSocketDisconnect:
                self.disconnect(user_id)
