#!/bin/bash

# Step 1: Zip the folder on the host server, excluding node_modules and .git
echo "Step 1: Zipping the folder on the host server (excluding node_modules and .git)..."
ssh -i $PEM_FILE $SERVER_USER@$SERVER_HOST "zip -r $ZIP_FILE $REMOTE_FOLDER --exclude '*/node_modules/*'"
if [ $? -eq 0 ]; then
    echo "Zipping completed successfully."
else
    echo "Zipping failed. Exiting."
    exit 1
fi

# Step 2: Transfer the zipped folder to the local machine
echo "Step 2: Transferring the zipped folder to the local machine..."
scp -i $PEM_FILE $SERVER_USER@$SERVER_HOST:/home/$SERVER_USER/$ZIP_FILE $LOCAL_DESTINATION
if [ $? -eq 0 ]; then
    echo "Transfer completed successfully."
else
    echo "Transfer failed. Exiting."
    exit 1
fi

# Step 3: Extract the ZIP file locally
echo "Step 3: Extracting the ZIP file..."
unzip $LOCAL_DESTINATION/$ZIP_FILE -d $LOCAL_DESTINATION
if [ $? -eq 0 ]; then
    echo "Extraction completed successfully."
else
    echo "Extraction failed. Exiting."
    exit 1
fi

# Step 4: Change into the extracted folder
echo "Step 4: Changing into the extracted folder..."
cd $LOCAL_DESTINATION/$EXTRACT_FOLDER || { echo "Failed to change into the extracted folder. Exiting."; exit 1; }
echo "Current directory: $(pwd)"

echo "All steps completed successfully."
