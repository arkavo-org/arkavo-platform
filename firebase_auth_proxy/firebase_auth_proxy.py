from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from firebase_admin import auth, credentials, initialize_app
import firebase_admin

# Initialize Firebase Admin
if not firebase_admin._apps:
    cred = credentials.Certificate("/app/firebase-admin.json")
    initialize_app(cred)

# Allowed origin
ALLOWED_ORIGINS = ["https://cc.app.codecollective.us", "levatel.app.codecollective.us"]

app = FastAPI()

# Optional CORS middleware (for frontend integration, if needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def verify_token(request: Request):
    # Enforce origin check
    origin = request.headers.get("origin")
    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(status_code=403, detail="Invalid origin")

    # Get ID token from Authorization header
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid authorization header"
        )

    id_token = auth_header.split(" ")[1]

    try:
        decoded_token = auth.verify_id_token(id_token)
        return decoded_token  # You can return user info like uid or email
    except Exception as e:
        raise HTTPException(
            status_code=401, detail=f"Token verification failed: {str(e)}"
        )


@app.get("/secure-data")
async def secure_data(user=Depends(verify_token)):
    return {
        "message": "Access granted to secure data",
        "user": {"uid": user["uid"], "email": user.get("email")},
    }
