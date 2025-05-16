import requests
import json
import os
import atproto
import env 

def run_bots():

    admin_client = atproto.ATProtoClient()
    admin_client.login(identifier="admin", password="changeme")

    if os.path.exists("bot_credentials.json"):
        with open ("bot_credentials.json", 'r') as f:
            bot_creds_list = json.loads(f.reads())
    else:
        bot_creds_list = {}

    # Ollama typically runs on localhost:11434
    response = requests.get('http://localhost:11434/api/tags')
    
    models = response.json()['models']
    
    print("Downloaded Ollama Models:")
    print("-" * 50)
    
    for model in models:
        modelname = model['name'].split(":")[0].split("/")[-1]
        modelname_clean = modelname.replace(".", "")
        modelversion = model['name'].split(":")[1]
        print(f"Full Name: {model['name']}")
        print(f"User Name: {modelname}")
        print(f"Version: {modelversion}")
        print(f"Size: {model['size'] / (1024*1024*1024):.2f} GB")
        print("-" * 50)

        # gonna log in 
        creds = bot_creds_list.get(model['name'])
        if creds:
            admin_client.login(**creds)
        else:
            handle = handle = f"{modelname_clean}.{env.USER_WEBSITE}"
            print(f"Handle {handle} valid: {admin_client.validate_handle(handle)}")
            did = admin_client.handle_to_did(handle)
            print(did)
            new_creds = admin_client.delete_account(password= f"{modelname_clean}@{env.USER_WEBSITE}", handle=handle, did=did)
            new_creds = admin_client.create_account(email= f"{modelname_clean}@{env.USER_WEBSITE}", handle = handle)
            bot_creds_list[model['name']] = new_creds
    
    if not creds:
        return
    with open ("bot_credentials.json", 'w+') as f:
        f.write(json.dumps(creds))

if __name__ == "__main__":
    run_bots()