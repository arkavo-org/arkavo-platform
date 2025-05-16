#!/bin/bash

# Name of the instance
INSTANCE_NAME="bluesky-vm"

# Check if the instance exists
if multipass list | grep -q "^$INSTANCE_NAME "; then
  echo "Instance '$INSTANCE_NAME' already exists. Removing it..."
  multipass delete $INSTANCE_NAME
  multipass purge
fi

# Launch the new instance with the updated cloud-init configuration
echo "Launching new instance '$INSTANCE_NAME'..."
multipass launch --name $INSTANCE_NAME \
  --network docker0 \
  --disk 30G \
  --cloud-init cloud-init.yaml \
  22.04 \
  --mount $(pwd):/home/ubuntu/bluesky

echo "Instance '$INSTANCE_NAME' launched successfully!"
