from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
import os
import uuid
import aiohttp
import asyncio
import keycloak
import redis
from fastapi.security import HTTPBearer
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from jose import jwt, JWTError
import requests
import env

# Redis setup
redis_client = redis.Redis(host='redis_messaging', port=6379, db=0)

# Redis key patterns
MESSAGES_KEY = "messages:all"
MESSAGES_BY_LANG_KEY = "messages:lang:{}"
MESSAGE_HASH_KEY = "message:{}"
MESSAGE_TIMESTAMP_INDEX = "messages:timestamp"
LANGUAGES_SET = "languages"
MESSAGES_CHANNEL = "messages:updates"

class Message(BaseModel):
    text: str
    sender: str
    timestamp: datetime
    metadata: Optional[dict] = None

def store_message(message: Message, language: str = None):
    """Store message in Redis with best practices"""
    message_id = str(uuid.uuid4())
    message_dict = message.dict()
    
    pipe = redis_client.pipeline()
    pipe.hset(MESSAGE_HASH_KEY.format(message_id), mapping=message_dict)
    pipe.zadd(MESSAGE_TIMESTAMP_INDEX, {message_id: int(message.timestamp.timestamp())})
    pipe.sadd(MESSAGES_KEY, message_id)
    
    if language:
        pipe.sadd(MESSAGES_BY_LANG_KEY.format(language), message_id)
        pipe.sadd(LANGUAGES_SET, language)
        pipe.publish(MESSAGES_CHANNEL, f"{message_id}:{language}")
    
    pipe.execute()
    return message_id

def get_messages(since: datetime = None, language: str = None):
    """Retrieve messages from Redis"""
    if language:
        message_ids = redis_client.smembers(MESSAGES_BY_LANG_KEY.format(language))
    else:
        message_ids = redis_client.smembers(MESSAGES_KEY)
    
    messages = []
    for msg_id in message_ids:
        msg_data = redis_client.hgetall(MESSAGE_HASH_KEY.format(msg_id.decode()))
        if msg_data:
            message = {
                'id': msg_id.decode(),
                'text': msg_data[b'text'].decode(),
                'sender': msg_data[b'sender'].decode(),
                'timestamp': datetime.fromisoformat(msg_data[b'timestamp'].decode()),
            }
            if b'metadata' in msg_data:
                message['metadata'] = eval(msg_data[b'metadata'].decode())
            
            if since is None or message['timestamp'] >= since:
                messages.append(message)
    
    messages.sort(key=lambda x: x['timestamp'])
    return messages

# FastAPI app setup
app = FastAPI()
security = HTTPBearer()

@app.on_event("startup")
async def startup_event():
    try:
        response = requests.get("http://libretranslate:5000/languages")
        response.raise_for_status()
        languages = [lang["code"] for lang in response.json()]
        for lang in languages:
            redis_client.sadd(LANGUAGES_SET, lang)
    except Exception as e:
        print(f"Failed to fetch languages: {e}")

@app.post("/messages")
async def create_message(message: Message, current_user: dict = Depends(get_current_user)):
    message.sender = current_user.get("preferred_username", "anonymous")
    message.timestamp = datetime.now(timezone.utc)
    
    try:
        async with aiohttp.ClientSession() as session:
            detect_response = await session.post(
                "http://libretranslate:5000/detect",
                json={"q": message.text}
            )
            detect_data = await detect_response.json()
            source_lang = detect_data[0]["language"]

            languages = [lang.decode() for lang in redis_client.smembers(LANGUAGES_SET)]
            tasks = [
                translate_message_async(session, lang, source_lang, message)
                for lang in languages
            ]
            results = await asyncio.gather(*tasks)

            for lang_code, translated_msg in results:
                if translated_msg:
                    store_message(translated_msg, lang_code)
                    # Broadcast to WebSocket clients in this language
                    await manager.send_message_to_language(lang_code, {
                        'type': 'new_message',
                        'message': translated_msg.dict()
                    })
    
    except Exception as e:
        print(f"Error processing message: {e}")
        raise HTTPException(status_code=500, detail="Message processing failed")

    return {"status": "Message processed"}

@app.get("/messages")
async def get_messages(since: Optional[str] = None, language: Optional[str] = None):
    try:
        since_dt = None
        if since:
            since = since.replace("Z", "+00:00") if since.endswith("Z") else since
            since_dt = datetime.fromisoformat(since)
        return {"messages": get_messages(since=since_dt, language=language)}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid datetime format")

@app.get("/languages")
async def get_languages():
    languages = [lang.decode() for lang in redis_client.smembers(LANGUAGES_SET)]
    return {"languages": languages}

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, dict] = {}  # {client_id: {'ws': WebSocket, 'lang': str}}
        self.pubsub = redis_client.pubsub()

    async def connect(self, websocket: WebSocket, client_id: str, language: str):
        await websocket.accept()
        self.active_connections[client_id] = {
            'ws': websocket,
            'lang': language
        }
        # Subscribe to messages channel in background
        asyncio.create_task(self.listen_for_messages(client_id, language))

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def listen_for_messages(self, client_id: str):
        self.pubsub.subscribe(MESSAGES_CHANNEL)
        for message in self.pubsub.listen():
            if message['type'] == 'message':
                msg_id, lang = message['data'].decode().split(':')
                msg_data = redis_client.hgetall(MESSAGE_HASH_KEY.format(msg_id))
                if msg_data:
                    await self.send_message(client_id, {
                        'type': 'new_message',
                        'message': {
                            'id': msg_id,
                            'text': msg_data[b'text'].decode(),
                            'sender': msg_data[b'sender'].decode(),
                            'timestamp': msg_data[b'timestamp'].decode()
                        }
                    })

    async def send_message(self, client_id: str, message: dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception:
                self.disconnect(client_id)

    async def send_initial_messages(self, websocket: WebSocket, language: str = "en"):
        try:
            # Get all messages without timestamp filter
            messages = get_messages(language=language, since=None)
            total_count = len(messages)
            print(f"Found {total_count} messages for language {language}")
            
            # Send all messages (not just last 20)
            await websocket.send_json({
                'type': 'initial_messages',
                'messages': messages,
                'total_count': total_count
            })
        except Exception as e:
            print(f"Error sending initial messages: {e}")
            raise

manager = ConnectionManager()

# Revised WebSocket endpoint
@app.websocket("/ws/messages")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client_id = None
    
    try:
        # Wait for auth message first
        data = await websocket.receive_json()
        if data.get("type") != "auth":
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
            
        try:
            payload = await keycloak.verify_token(data["token"])
            client_id = payload.get("sub") or str(uuid.uuid4())
            await websocket.send_json({"type": "auth-success"})
        except Exception as e:
            await websocket.send_json({
                "type": "auth-failure",
                "message": str(e)
            })
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        # Get client's preferred language
        language = "en"  # default
        if "accept-language" in websocket.headers:
            language = websocket.headers["accept-language"].split(',')[0]

        # Send initial messages
        messages = get_messages(language=language)
        await websocket.send_json({
            "type": "initial-messages",
            "messages": [{**msg.dict(), "id": msg_id} for msg_id, msg in zip(message_ids, messages)]
        })

        # Main message loop
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "message":
                message = Message(
                    text=data["text"],
                    sender=payload.get("preferred_username", "anonymous"),
                    timestamp=datetime.now(timezone.utc)
                )
                store_message(message, language)
                
    except WebSocketDisconnect:
        if client_id:
            manager.disconnect(client_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if client_id:
            manager.disconnect(client_id)
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
