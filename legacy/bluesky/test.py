import requests
import json
from typing import Dict, Any
import datetime

class BlueskyClient:
    def __init__(self, base_url, verify_ssl: bool = True):
        self.base_url = base_url.rstrip('/')
        self.session = requests.Session()
        self.access_jwt = None
        self.refresh_jwt = None
        self.session.verify = verify_ssl

    def check_health(self) -> bool:
        """Test the health check endpoint."""
        try:
            response = self.session.get(f"{self.base_url}/xrpc/_health")
            response.raise_for_status()
            print("✓ Health check passed")
            return True
        except requests.exceptions.RequestException as e:
            print(f"✗ Health check failed: {str(e)}")
            return False

    def login(self, identifier: str, password: str) -> bool:
        try:
            auth_data = {
                "identifier": identifier,
                "password": password
            }
            response = self.session.post(
                f"{self.base_url}/xrpc/com.atproto.server.createSession",
                json=auth_data,
                headers={
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            )
            print(f"Request payload: {auth_data}")
            print(f"Response status: {response.status_code}")
            print(f"Response headers: {dict(response.headers)}")
            print(f"Response body: {response.text}")
            
            response.raise_for_status()
            data = response.json()
            
            self.access_jwt = data.get('accessJwt')
            self.refresh_jwt = data.get('refreshJwt')
            
            if self.access_jwt:
                self.session.headers.update({
                    'Authorization': f'Bearer {self.access_jwt}'
                })
                print("✓ Authentication successful")
                return True
            else:
                print("✗ Authentication failed: No access token received")
                return False
        except requests.exceptions.RequestException as e:
            print(f"✗ Authentication failed: {str(e)}")
            return False


    def get_timeline(self) -> Dict[str, Any]:
        """Test retrieving the timeline."""
        try:
            response = self.session.get(
                f"{self.base_url}/xrpc/app.bsky.feed.getTimeline"
            )
            response.raise_for_status()
            print("✓ Timeline retrieved successfully")
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"✗ Timeline fetch failed: {str(e)}")
            return {}

    def get_profile(self, actor: str) -> Dict[str, Any]:
        """Test retrieving a user profile."""
        try:
            response = self.session.get(
                f"{self.base_url}/xrpc/app.bsky.actor.getProfile",
                params={"actor": actor}
            )
            response.raise_for_status()
            print("✓ Profile retrieved successfully")
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"✗ Profile fetch failed: {str(e)}")
            return {}

    def create_post(self, text: str) -> Dict[str, Any]:
        """Test creating a new post."""
        try:
            post_data = {
                "collection": "app.bsky.feed.post",
                "repo": "self",
                "record": {
                    "$type": "app.bsky.feed.post",
                    "text": text,
                    "createdAt": datetime.datetime.now().isoformat()
                }
            }
            
            response = self.session.post(
                f"{self.base_url}/xrpc/com.atproto.repo.createRecord",
                json=post_data
            )
            response.raise_for_status()
            print("✓ Post created successfully")
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"✗ Post creation failed: {str(e)}")
            return {}

def main():
    # Initialize the tester
    tester = BlueskyClient("https://app.codecollective.us/")
    tester.login("admin", "changeme") 
    
    # Run tests
    if not tester.check_health():
        print("Stopping tests due to failed health check")
        return
    
    # Run authenticated tests
    timeline = tester.get_timeline()
    if timeline:
        print("Timeline entries:", len(timeline.get("feed", [])))
    
    profile = tester.get_profile("test-user.bsky.social")
    if profile:
        print("Profile data:", json.dumps(profile, indent=2))
        
    # Try to create a test post
    post_result = tester.create_post("Hello from the API test!")
    if post_result:
        print("Post created:", post_result)

if __name__ == "__main__":
    main()