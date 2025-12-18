#!/usr/bin/env python3
"""
stopAll.py - Stop all containers started by run.py

This script stops the Nextcloud containers in the proper order:
1. nextcloud-nginx (reverse proxy)
2. nextcloud-app (PHP-FPM application)
3. nextcloud-redis (Redis cache)
4. nextcloud-db (PostgreSQL database)

It uses the same configuration from env.py to ensure consistency.
"""

import os
import sys
import time

# Add current directory to path to import local modules
here = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, here)

import utils_docker

def stop_nextcloud_containers():
    """Stop all Nextcloud containers."""
    print("Stopping Nextcloud containers...")
    
    # Import env to get container names and network
    import env
    
    # Stop containers in reverse order of startup
    containers_to_stop = [
        "nextcloud-nginx",  # Nginx reverse proxy
        "nextcloud-app",    # PHP-FPM application
        "nextcloud-redis",  # Redis cache
        "nextcloud-db",     # PostgreSQL database
    ]
    
    for container_name in containers_to_stop:
        print(f"Stopping {container_name}...")
        try:
            utils_docker.stop_container(container_name)
            print(f"  {container_name} stopped successfully")
        except Exception as e:
            print(f"  Warning: Could not stop {container_name}: {e}")
    
    print("\nAll Nextcloud containers have been stopped.")

def list_running_containers():
    """List all running containers for verification."""
    print("\nChecking running containers...")
    try:
        import docker
        client = docker.from_env()
        containers = client.containers.list()
        
        if not containers:
            print("No containers are currently running.")
            return
        
        print("Currently running containers:")
        for container in containers:
            print(f"  - {container.name} ({container.image.tags[0] if container.image.tags else 'no tag'})")
    except Exception as e:
        print(f"Error listing containers: {e}")

def main():
    """Main function."""
    print("=" * 60)
    print("stopAll.py - Stop Nextcloud Containers")
    print("=" * 60)
    
    # First, list what's running
    list_running_containers()
    
    # Ask for confirmation
    print("\n" + "-" * 60)
    response = input("Do you want to stop all Nextcloud containers? (y/N): ").strip().lower()
    
    if response not in ['y', 'yes']:
        print("Operation cancelled.")
        return
    
    print("\n" + "-" * 60)
    
    # Stop the containers
    stop_nextcloud_containers()
    
    # List containers again to verify
    print("\n" + "-" * 60)
    list_running_containers()
    
    print("\n" + "=" * 60)
    print("Stop process completed.")
    print("=" * 60)

if __name__ == "__main__":
    main()
