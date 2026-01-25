import json
import os
import subprocess
import sys
import time

import util
import utils_docker

here = os.path.abspath(os.path.dirname(__file__))


# create env.py file if this is the first run
util.initializeFiles()

print("Reading env.py")
import env
in_github_actions = os.getenv("GITHUB_ACTIONS") == "true"

print("Applying env var substitutions in hard-coded .template files")
util.substitutions(here, env)
util.writeViteEnv(vars(env))

EXTRA_HOST_TARGET = os.getenv("ARKAVO_EXTRA_HOST_TARGET", "host-gateway")
GATEWAY_ALIAS = os.getenv("ARKAVO_GATEWAY_ALIAS", "host.docker.internal")


def _collect_public_hostnames(env_module) -> list[str]:
    hostnames = set()
    for key, value in vars(env_module).items():
        if not isinstance(value, str):
            continue
        if "://" in value:
            continue
        if key.endswith("_BASE_URL"):
            hostnames.add(value)
    for attr in ("USER_WEBSITE", "BACKEND_LOCATION"):
        value = getattr(env_module, attr, None)
        if isinstance(value, str) and value:
            hostnames.add(value)
    hostnames.add(GATEWAY_ALIAS)
    return sorted(hostnames)


def configure_container_extra_hosts(env_module) -> None:
    hostnames = _collect_public_hostnames(env_module)
    if not hostnames:
        print("No hostnames discovered for container extra_hosts override")
        return

    for value in vars(env_module).values():
        if not isinstance(value, dict):
            continue
        if "name" not in value or "image" not in value:
            continue
        extra_hosts = value.setdefault("extra_hosts", {})
        changed = False
        for hostname in hostnames:
            if hostname in extra_hosts:
                continue
            extra_hosts[hostname] = EXTRA_HOST_TARGET
            changed = True
        if changed:
            print(f"Added extra_hosts overrides for {value.get('name')}")


configure_container_extra_hosts(env)


def configure_container_ca_trust(env_module) -> None:
    if env_module.USER_WEBSITE != "localhost":
        return

    ca_path = os.path.join(env_module.keys_dir, "keycloak-ca.pem")
    if not os.path.isfile(ca_path):
        print(f"Local CA not found at {ca_path}; skipping container CA trust wiring")
        return

    for value in vars(env_module).values():
        if not isinstance(value, dict):
            continue
        if "name" not in value or "image" not in value:
            continue

        volumes = value.get("volumes")
        if volumes is None:
            volumes = {}
            value["volumes"] = volumes
        if isinstance(volumes, dict):
            volumes.setdefault(
                ca_path, {"bind": "/etc/ssl/certs/keycloak-ca.pem", "mode": "ro"}
            )
        elif isinstance(volumes, list):
            ca_mount = f"{ca_path}:/etc/ssl/certs/keycloak-ca.pem:ro"
            if ca_mount not in volumes:
                volumes.append(ca_mount)
        else:
            print(
                f"Skipping CA mount for {value.get('name')} due to unsupported volumes type"
            )
        env_vars = value.setdefault("environment", {})
        env_vars.setdefault("REQUESTS_CA_BUNDLE", "/etc/ssl/certs/keycloak-ca.pem")
        env_vars.setdefault("SSL_CERT_FILE", "/etc/ssl/certs/keycloak-ca.pem")
        env_vars.setdefault("CURL_CA_BUNDLE", "/etc/ssl/certs/keycloak-ca.pem")


configure_container_ca_trust(env)


def ensure_users_api_image(image_name: str) -> None:
    """Build the users-api Docker image if it is missing."""
    print(f"Checking for Docker image '{image_name}'")
    inspect = subprocess.run(
        ["docker", "image", "inspect", image_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if inspect.returncode == 0:
        print(f"Docker image '{image_name}' already exists")
        return

    print(f"Docker image '{image_name}' not found. Building from users/Dockerfile...")
    subprocess.check_call(
        ["docker", "build", "-t", image_name, "."], cwd=os.path.join(here, "users")
    )


def ensure_opentdf_image(image_name: str) -> None:
    """Build the OpenTDF Docker image from opentdf-platform/Dockerfile if missing."""
    print(f"Checking for Docker image '{image_name}'")
    inspect = subprocess.run(
        ["docker", "image", "inspect", image_name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if inspect.returncode == 0:
        print(f"Docker image '{image_name}' already exists")
        return

    print(
        f"Docker image '{image_name}' not found. Building from opentdf-platform/Dockerfile..."
    )
    subprocess.check_call(
        ["docker", "build", "-t", image_name, "-f", "Dockerfile", "."],
        cwd=os.path.join(here, "opentdf-platform"),
    )

# Check if the keys directory exists, if not, generate temporary keys for localhost or production keys
if env.USER_WEBSITE == "localhost":
    localhost_cert = os.path.join(env.keys_dir, "localhost.crt")
    localhost_key = os.path.join(env.keys_dir, "localhost.key")
    if not (os.path.isfile(localhost_cert) and os.path.isfile(localhost_key)):
        try:
            # Use the new Python script that includes all subdomains
            subprocess.check_call([sys.executable, "init-temp-keys.py"], cwd="certs")
            print("Ok - generated temporary keys for localhost with all subdomains")
            sys.stdout.flush()  # Force flush in CI environments
        except subprocess.CalledProcessError as e:
            print(f"Script failed with exit code {e.returncode}")
            sys.exit(e.returncode)
else:
    if not os.path.isdir(env.keys_dir):
        utils_docker.generateProdKeys(env)

# Convert env.py to a dictionary
print("Converting env.py to a dictionary")
config = vars(env)
# make sure the network is up
print("Making sure the Docker network is up")
utils_docker.ensure_network(env.NETWORK_NAME)

# create the keycloak keys if they dont exist
print("Checking if Keycloak keys exist")
if not os.path.isdir("certs/keys"):
    os.system("cd certs && ./init-temp-keys.sh")

print("Running Keycloak")
# --- KEYCLOAK ---
if "keycloak" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.keycloakdb)
    utils_docker.wait_for_db(network=env.NETWORK_NAME, db_url="keycloakdb:5432")
    utils_docker.run_container(env.keycloak)


# --- WEB APP ---
# theoretically has no dependencies
if "webapp" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.webapp)
if "webapp_build" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.webapp_build)
    if "webapp_android_build" in env.SERVICES_TO_RUN:
        utils_docker.run_container(env.webapp_android_build)

if "nextcloud" in env.SERVICES_TO_RUN:
    print("Running Nextcloud stack")
    utils_docker.run_container(env.nextcloud_db)
    utils_docker.wait_for_db(network=env.NETWORK_NAME, db_url="nextcloud-db:5432")
    utils_docker.run_container(env.nextcloud_redis)
    utils_docker.run_container(env.nextcloud_app)
    utils_docker.wait_for_port("nextcloud-app", 80, network=env.NETWORK_NAME)
    
# --- NGINX ---

# --- ORG ---
if "org" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.org)

    
# --- MATRIX SYNAPSE ---
if "synapse" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.synapsedb)
    utils_docker.wait_for_db(network=env.NETWORK_NAME, db_url="synapsedb:5432")
    utils_docker.run_container(env.synapse)

    
if "element" in env.SERVICES_TO_RUN:
    # --- Element web app ---
    utils_docker.run_container(env.element)

    
# --- OLLAMA !!! ---
if "ollama" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.ollama)
    utils_docker.pullModels(env.MODELS_TO_PULL,env.NETWORK_NAME)
    
if "deepseekjanus" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.deepseek_janus)

    
# --- BLUESKY PDS --- 
if "bluesky" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.bluesky)
    utils_docker.run_container(env.bluesky_bridge)
    utils_docker.run_container(env.bsky_fyp)

    
if "sglang" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.sglang)

if "gitea" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.gitea)

if "whisper" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.whisper)

if "mongo" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.mongo_db)
    utils_docker.wait_for_mongo(network=env.NETWORK_NAME, db_url="mongo_db:27017")
    utils_docker.run_container(env.mongo_api)
    utils_docker.run_container(env.mongo_studio)

if "libretranslate" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.libretranslate)

if "users" in env.SERVICES_TO_RUN:
    ensure_users_api_image(env.users_api.get("image", "users-api"))
    utils_docker.run_container(env.usersdb)
    utils_docker.run_container(env.redis)
    utils_docker.run_container(env.users_api)

# --- BALLOT ---
if "ballot" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.ballot_redis)
    utils_docker.run_container(env.ballot_backend)

# --- IROH ---
if "iroh" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.iroh)

# --- NGINX ---
if "nginx" in env.SERVICES_TO_RUN:
    if not os.path.isfile("certs/ca.crt"):
        if env.USER_WEBSITE == "localhost" and not not in_github_actions:
            utils_docker.generateDevKeys(outdir=env.certs_dir)
        else:
            pass
            #utils_docker.generateProdKeys(outdir=env.certs_dir, website=env.USER_WEBSITE)
    utils_docker.run_container(env.nginx)


    
# --- OPENTDF ---
if "opentdf" in env.SERVICES_TO_RUN:
    opentdf_container_running = False
    try:
        container = utils_docker.DOCKER_CLIENT.containers.get(env.opentdf["name"])
        opentdf_container_running = container.status == "running"
    except Exception:
        # Container doesn't exist or Docker isn't reporting it as running yet
        pass
    ensure_opentdf_image(env.opentdf.get("image", "opentdf"))
    utils_docker.run_container(env.opentdfdb)
    utils_docker.wait_for_db(network=env.NETWORK_NAME, db_url="opentdfdb:5432")
    if not opentdf_container_running and False:
        print(f"Waiting for {env.KEYCLOAK_INTERNAL_AUTH_URL}")
        utils_docker.wait_for_url(
            env.KEYCLOAK_INTERNAL_AUTH_URL, network=env.NETWORK_NAME
        )
    utils_docker.run_container(env.opentdf)
