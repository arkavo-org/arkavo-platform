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

# Security scheme for JWT tokens
security = HTTPBearer()
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
SQLALCHEMY_DATABASE_URL = f"postgresql://postgres:{env.postgres_pw}@usersdb/postgres"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
current_dir = os.path.dirname(os.path.abspath(__file__))

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
