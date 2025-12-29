#!/usr/bin/env python3
"""
stopAll.py - Stop all containers started by run.py

This script stops the Nextcloud containers in the proper order. By default it
stops only the frontend components (nginx + PHP-FPM). Use --dbs if you also
need to stop Redis/PostgreSQL.

It uses the same configuration from env.py to ensure consistency.
"""

import argparse
import os
import sys
import time

# Add current directory to path to import local modules
here = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, here)

import utils_docker

def _containers_to_stop(stop_dbs: bool) -> list[str]:
    containers = [
        "nextcloud-app",    # PHP-FPM application
    ]
    if stop_dbs:
        containers.extend(
            [
                "nextcloud-redis",  # Redis cache
                "nextcloud-db",     # PostgreSQL database
            ]
        )
    return containers


def stop_nextcloud_containers(stop_dbs: bool) -> None:
    """Stop the requested Nextcloud containers."""
    print("Stopping Nextcloud containers...")
    
    # Import env to get container names and network
    import env
    
    containers_to_stop = _containers_to_stop(stop_dbs)
    if not stop_dbs:
        print("Leaving nextcloud-redis and nextcloud-db running (use --dbs to stop them).")
    
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

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stop Nextcloud containers")
    parser.add_argument(
        "--dbs",
        action="store_true",
        help="Also stop nextcloud-redis and nextcloud-db",
    )
    return parser.parse_args()


def main():
    """Main function."""
    args = parse_args()
    print("=" * 60)
    print("stopAll.py - Stop Nextcloud Containers")
    print("=" * 60)
    
    # First, list what's running
    list_running_containers()
    
    # Show planned stops and ask for confirmation
    print("\n" + "-" * 60)
    planned = _containers_to_stop(args.dbs)
    print("This will stop:")
    for name in planned:
        print(f"  - {name}")
    response = input("\nDo you want to stop the containers listed above? (y/N): ").strip().lower()
    
    if response not in ['y', 'yes']:
        print("Operation cancelled.")
        return
    
    print("\n" + "-" * 60)
    
    # Stop the containers
    stop_nextcloud_containers(stop_dbs=args.dbs)
    
    # List containers again to verify
    print("\n" + "-" * 60)
    list_running_containers()
    
    print("\n" + "=" * 60)
    print("Stop process completed.")
    print("=" * 60)

if __name__ == "__main__":
    main()
