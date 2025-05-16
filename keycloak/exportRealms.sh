#!/bin/bash

# Set variables
CONTAINER_NAME="keycloak"
REALM_NAME="opentdf"
EXPORT_DIR="/opt/keycloak/data/export"
LOCAL_EXPORT_DIR="./realms"

# Create local export directory
mkdir -p "$LOCAL_EXPORT_DIR"

# Export realm and users
echo "Exporting Keycloak realm and users..."
docker exec -it $CONTAINER_NAME /opt/keycloak/bin/kc.sh export \
    --dir $EXPORT_DIR \
    --realm $REALM_NAME \
    --users skip

docker exec -it keycloak /opt/keycloak/bin/kc.sh export --dir /opt/keycloak/data/export --realm opentdf --users different_files

# Check if export was successful
if [ $? -ne 0 ]; then
    echo "Error: Export failed"
    exit 1
fi

# Copy exported files from container to host
echo "Copying exported files to local system..."
docker cp "$CONTAINER_NAME:$EXPORT_DIR/$REALM_NAME-realm.json" "$LOCAL_EXPORT_DIR/"
docker cp "$CONTAINER_NAME:$EXPORT_DIR/$REALM_NAME-users-0.json" "$LOCAL_EXPORT_DIR/"

# Check if files exist
if [ -f "$LOCAL_EXPORT_DIR/$REALM_NAME-realm.json" ] && [ -f "$LOCAL_EXPORT_DIR/$REALM_NAME-users-0.json" ]; then
    echo "Export completed successfully!"
    echo "Files exported to: $LOCAL_EXPORT_DIR"
    echo "  - $REALM_NAME-realm.json"
    echo "  - $REALM_NAME-users-0.json"
else
    echo "Error: Export files not found"
    exit 1
fi