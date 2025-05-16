import requests
from typing import List

# Keycloak credentials
KEYCLOAK_URL = "https://keycloak.app.codecollective.us/auth"
KEYCLOAK_USER = "ollama"
KEYCLOAK_PASSWORD = "ollama"
KEYCLOAK_CLIENT_ID = "synapse"  # Replace with your Keycloak client ID
KEYCLOAK_REALM = "opentdf"  # Replace with your Keycloak realm

# Ollama API endpoint
OLLAMA_API_URL = "https://ollama.app.codecollective.us/api/generate"

# Matrix credentials
MATRIX_HOMESERVER = "https://matrix.app.codecollective.us"  # Replace with your homeserver
ARKAVO_ADMINS_ROOM = "!ARKAVO_ADMINS_ROOM_ID:matrix.app.codecollective.us"  # Replace with the actual room ID

# List of models to monitor
MODELS = ["llama3.2", "image", "other_model"]  # Add or modify models as needed

# Global Matrix access token
matrix_access_token = None

def get_keycloak_token() -> str:
    """Authenticate with Keycloak and retrieve an access token."""
    token_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
    payload = {
        "client_id": KEYCLOAK_CLIENT_ID,
        "client_secret": "changeme",  # Add this if using a confidential client
        "username": KEYCLOAK_USER,
        "password": KEYCLOAK_PASSWORD,
        "grant_type": "password",
    }

    try:
        response = requests.post(token_url, data=payload)
        response.raise_for_status()
        print("Got KC Token")
        return response.json().get("access_token")
    except requests.exceptions.RequestException as e:
        print(f"Failed to get Keycloak token: {e}")
        return ""

def login_to_matrix(token: str) -> bool:
    """Log in to the Matrix server using a Keycloak token."""
    global matrix_access_token
    print("Logging in to Matrix...")
    login_url = f"{MATRIX_HOMESERVER}/_matrix/client/r0/login"
    payload = {
        "type": "m.login.token",
        "token": token,
        "device_id": "OllamaBot",
    }

    try:
        response = requests.post(login_url, json=payload)
        response.raise_for_status()
        matrix_access_token = response.json().get("access_token")
        print("Logged in successfully!")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Failed to log in: {e}")
        print(f"Response: {response.text}")  # Print the response for debugging
        return False

def join_arkavo_admins_room() -> bool:
    """Join the Arkavo Admins room."""
    print(f"Joining room {ARKAVO_ADMINS_ROOM}...")
    join_url = f"{MATRIX_HOMESERVER}/_matrix/client/r0/join/{ARKAVO_ADMINS_ROOM}"
    headers = {
        "Authorization": f"Bearer {matrix_access_token}",
    }

    try:
        response = requests.post(join_url, headers=headers)
        response.raise_for_status()
        print(f"Joined room {ARKAVO_ADMINS_ROOM} successfully!")
        return True
    except requests.exceptions.RequestException as e:
        print(f"Failed to join room: {e}")
        return False

def get_last_10_messages(room_id: str) -> List[str]:
    """Fetch the last 10 messages from a room."""
    messages_url = f"{MATRIX_HOMESERVER}/_matrix/client/r0/rooms/{room_id}/messages"
    headers = {
        "Authorization": f"Bearer {matrix_access_token}",
    }
    params = {
        "dir": "b",
        "limit": 10,
    }

    try:
        response = requests.get(messages_url, headers=headers, params=params)
        response.raise_for_status()
        messages = []
        for event in response.json().get("chunk", []):
            if event.get("type") == "m.room.message":
                messages.append(event.get("content", {}).get("body", ""))
        return messages
    except requests.exceptions.RequestException as e:
        print(f"Failed to fetch messages: {e}")
        return []

def send_message_to_ollama(model: str, messages: List[str]) -> str:
    """Send messages to the Ollama API and return the response."""
    payload = {
        "model": model,
        "prompt": "\n".join(messages),
        "max_tokens": 100,
    }
    try:
        response = requests.post(OLLAMA_API_URL, json=payload)
        response.raise_for_status()
        return response.json().get("response", "No response from Ollama.")
    except requests.exceptions.RequestException as e:
        return f"Error calling Ollama API: {e}"

def forward_to_arkavo_admins(message: str):
    """Forward a message to the Arkavo Admins room."""
    send_url = f"{MATRIX_HOMESERVER}/_matrix/client/r0/rooms/{ARKAVO_ADMINS_ROOM}/send/m.room.message"
    headers = {
        "Authorization": f"Bearer {matrix_access_token}",
    }
    payload = {
        "msgtype": "m.text",
        "body": message,
    }

    try:
        response = requests.post(send_url, headers=headers, json=payload)
        response.raise_for_status()
        print(f"Forwarded message to Arkavo Admins: {message}")
    except requests.exceptions.RequestException as e:
        print(f"Failed to forward message: {e}")

def poll_messages():
    """Poll for new messages in the Arkavo Admins room."""
    sync_url = f"{MATRIX_HOMESERVER}/_matrix/client/r0/sync"
    headers = {
        "Authorization": f"Bearer {matrix_access_token}",
    }
    params = {
        "timeout": 30000,  # 30-second timeout
        "since": "",  # Start with no since token
    }

    while True:
        try:
            response = requests.get(sync_url, headers=headers, params=params)
            response.raise_for_status()
            data = response.json()
            params["since"] = data.get("next_batch", "")

            for room_id, room_data in data.get("rooms", {}).get("join", {}).items():
                for event in room_data.get("timeline", {}).get("events", []):
                    if event.get("type") == "m.room.message":
                        handle_message(room_id, event)

        except requests.exceptions.RequestException as e:
            print(f"Failed to sync messages: {e}")

def handle_message(room_id: str, event: dict):
    """Handle incoming messages."""
    print(f"New message in {room_id}: {event.get('content', {}).get('body', '')}")
    for model in MODELS:
        if model in event.get("content", {}).get("body", "").lower():
            print(f"Model '{model}' mentioned!")
            messages = get_last_10_messages(room_id)
            ollama_response = send_message_to_ollama(model, messages)
            forward_to_arkavo_admins(f"Ollama response for '{model}': {ollama_response}")

def main():
    # Get Keycloak token
    token = get_keycloak_token()
    if not token:
        print("Failed to acquire Keycloak token. Exiting.")
        return

    # Log in to Matrix using the Keycloak token
    if not login_to_matrix(token):
        return

    # Join the Arkavo Admins room
    if not join_arkavo_admins_room():
        return

    # Start polling for messages
    print("Listening for messages...")
    poll_messages()

if __name__ == "__main__":
    main()