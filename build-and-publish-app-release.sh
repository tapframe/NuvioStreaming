#!/bin/bash

# Usage: build-and-publish-app-release.sh <xavia-ota-url> [--yes] [--release-notes "text here"]
# --yes           Skip interactive confirmation
# --release-notes Provide release notes to attach to this upload

# Parse arguments
if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <xavia-ota-url> [--yes] [--release-notes \"text here\"]"
  echo "Example: $0 https://grim-reyna-tapframe-69970143.koyeb.app --yes --release-notes \"Bug fixes and improvements\""
  exit 1
fi

# Get the current commit hash and message
commitHash=$(git rev-parse HEAD)
commitMessage=$(git log -1 --pretty=%B)

# Check if app.json exists
if [ ! -f "app.json" ]; then
  echo "Error: app.json not found in current directory"
  exit 1
fi

# Auto-detect runtime version from app.json
runtimeVersion=$(jq -r '.expo.runtimeVersion' app.json)
if [ "$runtimeVersion" = "null" ] || [ -z "$runtimeVersion" ]; then
  echo "Error: Could not find runtimeVersion in app.json"
  echo "Please ensure app.json contains: \"runtimeVersion\": \"your-version\""
  exit 1
fi

# Assign arguments to variables
serverHost=$1
shift

SKIP_CONFIRM=false
RELEASE_NOTES=""

while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --yes)
      SKIP_CONFIRM=true
      shift
      ;;
    --release-notes)
      RELEASE_NOTES="$2"
      shift
      shift
      ;;
    *)
      echo "Unknown option: $1"
      shift
      ;;
  esac
done

# Validate server URL format
if [[ ! "$serverHost" =~ ^https?:// ]]; then
  echo "Error: Server URL must start with http:// or https://"
  echo "Example: https://grim-reyna-tapframe-69970143.koyeb.app"
  exit 1
fi

# Generate a timestamp for the output folder
timestamp=$(date -u +%Y%m%d%H%M%S)
outputFolder="ota-builds/$timestamp"

# Display build information
echo "🚀 Nuvio OTA Build & Deploy Script"
echo "=================================="
echo "📁 Output Folder: $outputFolder"
echo "📱 Runtime Version: $runtimeVersion"
echo "🔗 Commit Hash: $commitHash"
echo "📝 Commit Message: $commitMessage"
echo "🌐 Server URL: $serverHost"
echo "📝 Release Notes: ${RELEASE_NOTES:-<none provided>}"
echo ""

if [ "$SKIP_CONFIRM" = false ]; then
  read -p "Do you want to proceed with these values? (y/n): " confirm
  if [ "$confirm" != "y" ]; then
    echo "❌ Operation cancelled by the user."
    exit 1
  fi
fi

echo "🔨 Starting build process..."

# Clean up any existing output folder
rm -rf $outputFolder
mkdir -p $outputFolder

# Run expo export with the specified output folder
echo "📦 Exporting Expo bundle..."
if ! npx expo export --output-dir $outputFolder; then
  echo "❌ Error: Expo export failed"
  exit 1
fi

# Extract expo config property from app.json and save to expoconfig.json
echo "⚙️  Extracting Expo configuration..."
jq '.expo' app.json > $outputFolder/expoconfig.json

# Zip the output folder
echo "📦 Creating deployment package..."
cd $outputFolder  
if ! zip -q -r ${timestamp}.zip .; then
  echo "❌ Error: Failed to create zip file"
  exit 1
fi

# Upload the zip file to the server
echo "🚀 Uploading to server..."
echo "📊 File size: $(du -h ${timestamp}.zip | cut -f1)"

# Check server health before upload
echo "🔍 Checking server status..."
if ! curl --http1.1 --max-time 10 --connect-timeout 5 -s -o /dev/null "$serverHost/api/manifest"; then
  echo "⚠️  Warning: Server may be slow or unresponsive"
  echo "💡 Proceeding with upload anyway..."
else
  echo "✅ Server is responding"
fi
echo ""

# Try upload with extended timeout and retry logic
max_retries=3
retry_count=0

while [ $retry_count -lt $max_retries ]; do
  echo "🔄 Upload attempt $((retry_count + 1))/$max_retries..."
  
  response=$(curl --http1.1 --max-time 300 --connect-timeout 30 -X POST $serverHost/api/upload \
    -F "file=@${timestamp}.zip" \
    -F "runtimeVersion=$runtimeVersion" \
    -F "commitHash=$commitHash" \
    -F "commitMessage=$commitMessage" \
    ${RELEASE_NOTES:+-F "releaseNotes=$RELEASE_NOTES"} \
    --write-out "HTTP_CODE:%{http_code}" \
    --silent \
    --show-error)
  
  # Extract HTTP code from response
  http_code=$(echo "$response" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
  
  # Check if we got a valid HTTP code
  if [ -z "$http_code" ] || ! [[ "$http_code" =~ ^[0-9]+$ ]]; then
    echo "❌ Failed to extract HTTP status code from response"
    echo "Response: $response"
    http_code="000"
  fi
  
  echo "HTTP Status: $http_code"
  
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo ""
    echo "✅ Successfully uploaded to $serverHost/api/upload"
    break
  else
    retry_count=$((retry_count + 1))
    if [ $retry_count -lt $max_retries ]; then
      echo "⚠️  Upload attempt $retry_count failed, retrying in 5 seconds..."
      sleep 5
    else
      echo "❌ Error: Upload failed after $max_retries attempts"
      echo "📊 Final HTTP Status: $http_code"
      if [ "$http_code" = "524" ]; then
        echo "💡 Error 524: Server timeout - try again later or check server capacity"
      elif [ "$http_code" = "413" ]; then
        echo "💡 Error 413: File too large - consider reducing bundle size"
      elif [ "$http_code" = "500" ]; then
        echo "💡 Error 500: Server error - check server logs"
      else
        echo "💡 Check server status and try again"
      fi
      exit 1
    fi
  fi
done

cd ..

# Remove the output folder and zip file
echo "🧹 Cleaning up temporary files..."
rm -rf $outputFolder

echo "🎉 Build and deployment completed successfully!"
echo "📱 Runtime Version: $runtimeVersion"
echo "🔗 Commit: $commitHash"
