from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import jwt
import requests
from jwt.exceptions import InvalidTokenError
from sqlalchemy import create_engine, Column, String, Text
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import env

# PostgreSQL setup
SQLALCHEMY_DATABASE_URL = f"postgresql://postgres:{env.postgres_pw}@usersdb/postgres"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database models
class DBUser(Base):
    __tablename__ = "users"
    
    username = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
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

# Keycloak Configuration
KEYCLOAK_URL = env.KEYCLOAK_URL
KEYCLOAK_REALM = env.KEYCLOAK_REALM
ALGORITHM = "RS256"
security = HTTPBearer()

async def get_jwks():
    jwks_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
    response = requests.get(jwks_url)
    return response.json()

# JWT Authentication with Keycloak
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        jwks = await get_jwks()
        public_key = jwt.algorithms.RSAAlgorithm.from_jwk(jwks["keys"][0])
        payload = jwt.decode(
            token,
            public_key,
            algorithms=[ALGORITHM],
            audience="account",
            issuer=f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
        )
        return payload
    except InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

# FastAPI app
app = FastAPI()

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

@app.put("/users/{username}", response_model=User)
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
    return db_user

@app.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    return {"message": "Profile endpoint"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("users_api:app", host="0.0.0.0", port=8000, reload=True)
