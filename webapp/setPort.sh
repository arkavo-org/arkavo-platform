#!/bin/bash

# SET THE FRONTEND PORT BASED ON BRANCH

# Get the current Git branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Set the port based on the branch
if [ "$BRANCH" == "dev" ]; then
  export FRONTEND_PORT=3001
else
  export FRONTEND_PORT=3000
fi
