import os
import shutil
import sys
import util
import time
import os
import sys
import utils_docker
import json

here = os.path.abspath(os.path.dirname(__file__))

# create env.py file if this is the first run
util.initializeFiles()

print("Reading env.py")
import env
in_github_actions = os.getenv("GITHUB_ACTIONS") == "true"

print("Applying env var substitutions in hard-coded .template files")
util.substitutions(here, env)
util.writeViteEnv(vars(env))
import subprocess
# Check if the keys directory exists, if not, generate temporary keys for localhost or production keys
if not os.path.isdir(env.keys_dir):
    if env.USER_WEBSITE == "localhost":
        try:
            subprocess.check_call(["./init-temp-keys.sh"], cwd="certs")
            print("Ok - generated temporary keys for localhost")
            sys.stdout.flush()  # Force flush in CI environments
        except subprocess.CalledProcessError as e:
            print(f"Script failed with exit code {e.returncode}")
            sys.exit(e.returncode)
    else:
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

sys.stdout.flush()  # Force flush in CI environments

# --- WEB APP ---
# theoretically has no dependencies
if "webapp" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.webapp)
if "webapp_build" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.webapp_build)

sys.stdout.flush()  # Force flush in CI environments
    
# --- NGINX ---
if "nginx" in env.SERVICES_TO_RUN:
    if not os.path.isfile("certs/ca.crt"):
        if env.USER_WEBSITE == "localhost" and not not in_github_actions:
            utils_docker.generateDevKeys(outdir=env.certs_dir)
        else:
            pass
            #utils_docker.generateProdKeys(outdir=env.certs_dir, website=env.USER_WEBSITE)
    utils_docker.run_container(env.nginx)

sys.stdout.flush()  # Force flush in CI environments
    
# --- OPENTDF ---
if "opentdf" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.opentdfdb)
    utils_docker.wait_for_db(network=env.NETWORK_NAME, db_url="opentdfdb:5432")
    print(f"Waiting for {env.KEYCLOAK_INTERNAL_AUTH_URL}")
    utils_docker.wait_for_url(env.KEYCLOAK_INTERNAL_AUTH_URL, network=env.NETWORK_NAME)
    utils_docker.run_container(env.opentdf)

sys.stdout.flush()  # Force flush in CI environments
    
# --- ORG ---
if "org" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.org)

sys.stdout.flush()  # Force flush in CI environments
    
# --- MATRIX SYNAPSE ---
if "synapse" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.synapsedb)
    utils_docker.wait_for_db(network=env.NETWORK_NAME, db_url="synapsedb:5432")
    utils_docker.run_container(env.synapse)

sys.stdout.flush()  # Force flush in CI environments
    
if "element" in env.SERVICES_TO_RUN:
    # --- Element web app ---
    utils_docker.run_container(env.element)

sys.stdout.flush()  # Force flush in CI environments
    
# --- OLLAMA !!! ---
if "ollama" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.ollama)
    utils_docker.pullModels(env.MODELS_TO_PULL,env.NETWORK_NAME)
    
if "deepseekjanus" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.deepseek_janus)

sys.stdout.flush()  # Force flush in CI environments
    
# --- BLUESKY PDS --- 
if "bluesky" in env.SERVICES_TO_RUN:
    utils_docker.run_container(env.bluesky)
    utils_docker.run_container(env.bluesky_bridge)
    utils_docker.run_container(env.bsky_fyp)

sys.stdout.flush()  # Force flush in CI environments
    
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
    utils_docker.run_container(env.usersdb)
    #utils_docker.run_container(env.users_api)


sys.stdout.flush()  # Force flush in CI environments
    