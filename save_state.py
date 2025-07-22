import os
import docker
import env 

# Config
CONTAINER_NAME = "keycloak_export"
REALM_NAME = "opentdf"
EXPORT_DIR = "/opt/keycloak/data/export"
LOCAL_EXPORT_DIR = os.path.join(env.keycloak_dir, "realms")
KC_DB_URL_HOST = "keycloakdb"

# Ensure local export directory exists
os.makedirs(LOCAL_EXPORT_DIR, exist_ok=True)

# Docker client
client = docker.from_env()

# Environment variables for the container
env_vars = {
    "KC_DB": "postgres",
    "KC_DB_URL_HOST": KC_DB_URL_HOST,
    "KC_DB_URL_PORT": "5432",
    "KC_DB_URL_DATABASE": "keycloak",
    "KC_DB_USERNAME": env.POSTGRES_USER,
    "KC_DB_PASSWORD": env.POSTGRES_PASSWORD,
}

# Command to run inside the container
export_command = [
    "export",
    "--dir", EXPORT_DIR,
    "--realm", REALM_NAME,
    "--users", "different_files"
]

print("🚀 Running Keycloak export in a new container...")

client.containers.run(
    image=env.KEYCLOAK_IMAGE,
    name=CONTAINER_NAME,
    network=env.NETWORK_NAME,
    remove=False,  # auto-remove container
    environment=env_vars,
    command=export_command,
    volumes={
        LOCAL_EXPORT_DIR: {
            'bind': EXPORT_DIR,
            'mode': 'rw'
        }
    },
    detach=False,
    stdout=True,
    stderr=True
)
print(f"✅ Export complete! Files in: {LOCAL_EXPORT_DIR}")
