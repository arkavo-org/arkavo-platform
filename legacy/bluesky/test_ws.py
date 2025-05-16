#!/usr/bin/env python3
import ssl
import websocket
import sys
import certifi
import os
import tempfile

def add_ca_to_store(ca_path):
    """
    Adds a custom CA certificate to the default certifi store
    Returns path to the new store with the added certificate
    """
    # Read the custom CA certificate
    with open(ca_path, 'rb') as ca_file:
        custom_ca = ca_file.read()
    
    # Create a temporary file in the user's temp directory
    temp_fd, temp_store = tempfile.mkstemp(suffix='.pem')
    
    try:
        # Copy existing certificates and append the custom one
        with open(certifi.where(), 'rb') as certifi_file:
            with os.fdopen(temp_fd, 'wb') as temp_file:
                temp_file.write(certifi_file.read())
                temp_file.write(b'\n')
                temp_file.write(custom_ca)
    except:
        os.unlink(temp_store)  # Clean up on failure
        raise
    
    return temp_store

def on_message(ws, message):
    print(f"Received: {message}")

def on_error(ws, error):
    print(f"Error: {error}")

def on_close(ws, close_status_code, close_msg):
    print("Connection closed")

def on_open(ws):
    print("Connection established")

def main(ca_path):
    custom_store = None
    
    try:
        # Add custom CA to store
        custom_store = add_ca_to_store(ca_path)
        
        # Configure SSL context with custom store
        ssl_context = ssl.create_default_context(cafile=custom_store)
        
        # Configure websocket
        websocket.enableTrace(True)
        ws = websocket.WebSocketApp(
            "wss://localhost/xrpc/com.atproto.sync.subscribeRepos?cursor=0",
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )
        
        # Start connection with custom SSL context
        ws.run_forever(sslopt={"context": ssl_context})
    except KeyboardInterrupt:
        print("\nConnection terminated by user")
    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        # Clean up temporary store
        if custom_store and os.path.exists(custom_store):
            os.unlink(custom_store)

if __name__ == "__main__":
    main("../certs/ca.crt")