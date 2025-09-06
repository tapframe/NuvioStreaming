#!/bin/bash

# Check if the correct number of arguments are provided
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <runtimeVersion> <xavia-ota-url>"
  exit 1
fi

# Get the current commit hash and message
commitHash=$(git rev-parse HEAD)
commitMessage=$(git log -1 --pretty=%B)

# Assign arguments to variables
runtimeVersion=$1
serverHost=$2

# Generate a timestamp for the output folder
timestamp=$(date -u +%Y%m%d%H%M%S)
outputFolder="ota-builds/$timestamp"

# Ask the user to confirm the hash, commit message, runtime version, and output folder
echo "Output Folder: $outputFolder"
echo "Runtime Version: $runtimeVersion"
echo "Commit Hash: $commitHash"
echo "Commit Message: $commitMessage"

read -p "Do you want to proceed with these values? (y/n): " confirm

if [ "$confirm" != "y" ]; then
  echo "Operation cancelled by the user."
  exit 1
fi

rm -rf $outputFolder
mkdir -p $outputFolder

# Run expo export with the specified output folder
npx expo export --output-dir $outputFolder

# Extract expo config property from app.json and save to expoconfig.json
jq '.expo' app.json > $outputFolder/expoconfig.json


# Zip the output folder
cd $outputFolder  
zip -q -r ${timestamp}.zip .


# Upload the zip file to the server
curl -X POST $serverHost/api/upload -F "file=@${timestamp}.zip" -F "runtimeVersion=$runtimeVersion" -F "commitHash=$commitHash" -F "commitMessage=$commitMessage"

echo ""

echo "Uploaded to $serverHost/api/upload"
cd ..

# Remove the output folder and zip file
rm -rf $outputFolder

echo "Removed $outputFolder"
echo "Done"
