#!/bin/bash

# Check if SSL certificates exist
if [ ! -f "certs/privkey.pem" ] || [ ! -f "certs/fullchain.pem" ]; then
    echo "ERROR: SSL certificates not found!"
    echo "Required files:"
    echo "  - certs/privkey.pem (private key)"
    echo "  - certs/fullchain.pem (certificate chain)"
    echo ""
    echo "Please generate SSL certificates first by running:"
    echo "  ./certs/genKeys.sh"
    echo ""
    echo "Or if you have existing certificates, copy them to the certs/ directory."
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    
    # Update package index
    sudo apt update
    
    # Install prerequisites
    sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Update package index again
    sudo apt update
    
    # Install Docker
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add current user to docker group to run without sudo
    sudo usermod -aG docker $USER
    
    newgrp docker
    echo "Docker group added. You may need to reboot"
    
else
    echo "Docker is installed!"

    # Install other dependencies
    sudo apt update
    sudo apt install -y python3 
    sudo apt install -y python3-docker

    # Update git submodules
    git submodule update

    # Run the main application
    python3 -u run.py

fi
