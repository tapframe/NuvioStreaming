#!/bin/bash

# Version Update Script for Nuvio App
# Updates version across app.json, SettingsScreen.tsx, and iOS Info.plist

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 <version> [build_number]"
    echo "Example: $0 0.7.0-beta.1 7"
    echo "Example: $0 1.0.0 10"
    echo ""
    echo "If build_number is not provided, it will be auto-incremented from current value"
}

# Check if version argument is provided
if [ $# -lt 1 ]; then
    print_error "Version argument is required"
    show_usage
    exit 1
fi

NEW_VERSION="$1"
NEW_BUILD_NUMBER="$2"

# Validate version format (basic check)
if [[ ! $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9\.]+)?$ ]]; then
    print_error "Invalid version format. Expected format: X.Y.Z or X.Y.Z-suffix"
    exit 1
fi

# File paths
APP_JSON="./app.json"
SETTINGS_SCREEN="./src/screens/SettingsScreen.tsx"
INFO_PLIST="./ios/Nuvio/Info.plist"
ANDROID_BUILD_GRADLE="./android/app/build.gradle"

# Check if files exist
for file in "$APP_JSON" "$SETTINGS_SCREEN" "$INFO_PLIST" "$ANDROID_BUILD_GRADLE"; do
    if [ ! -f "$file" ]; then
        print_error "File not found: $file"
        exit 1
    fi
done

print_status "Starting version update process..."
print_status "New version: $NEW_VERSION"

# Get current build number if not provided
if [ -z "$NEW_BUILD_NUMBER" ]; then
    CURRENT_BUILD=$(grep -o '"versionCode": [0-9]*' "$APP_JSON" | grep -o '[0-9]*')
    if [ -n "$CURRENT_BUILD" ]; then
        NEW_BUILD_NUMBER=$((CURRENT_BUILD + 1))
        print_status "Auto-incrementing build number from $CURRENT_BUILD to $NEW_BUILD_NUMBER"
    else
        print_warning "Could not find current build number, defaulting to 1"
        NEW_BUILD_NUMBER=1
    fi
fi

print_status "New build number: $NEW_BUILD_NUMBER"

# Backup files
print_status "Creating backups..."
cp "$APP_JSON" "${APP_JSON}.backup"
cp "$SETTINGS_SCREEN" "${SETTINGS_SCREEN}.backup"
cp "$INFO_PLIST" "${INFO_PLIST}.backup"
cp "$ANDROID_BUILD_GRADLE" "${ANDROID_BUILD_GRADLE}.backup"

# Function to restore backups on error
restore_backups() {
    print_warning "Restoring backups due to error..."
    mv "${APP_JSON}.backup" "$APP_JSON"
    mv "${SETTINGS_SCREEN}.backup" "$SETTINGS_SCREEN"
    mv "${INFO_PLIST}.backup" "$INFO_PLIST"
    mv "${ANDROID_BUILD_GRADLE}.backup" "$ANDROID_BUILD_GRADLE"
}

# Set trap to restore backups on error
trap restore_backups ERR

# Update app.json
print_status "Updating app.json..."
# Update version in expo section
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/g" "$APP_JSON"
# Update ALL runtimeVersion fields (handles multiple instances if they exist)
sed -i '' "s/\"runtimeVersion\": \"[^\"]*\"/\"runtimeVersion\": \"$NEW_VERSION\"/g" "$APP_JSON"
# Update versionCode in android section
sed -i '' "s/\"versionCode\": [0-9]*/\"versionCode\": $NEW_BUILD_NUMBER/g" "$APP_JSON"
# Update buildNumber in ios section
sed -i '' "s/\"buildNumber\": \"[^\"]*\"/\"buildNumber\": \"$NEW_BUILD_NUMBER\"/g" "$APP_JSON"
print_success "Updated app.json"

# Update SettingsScreen.tsx
print_status "Updating SettingsScreen.tsx..."
# Note: Use BSD sed compatible regex on macOS. Enable extended regex with -E.
sed -E -i '' "s/description=\"[0-9]+\.[0-9]+\.[0-9]+(-[^\"]*)?\"/description=\"$NEW_VERSION\"/g" "$SETTINGS_SCREEN"
print_success "Updated SettingsScreen.tsx"

# Update Info.plist
print_status "Updating Info.plist..."
# Update CFBundleShortVersionString
sed -i '' "/<key>CFBundleShortVersionString<\/key>/{n;s/<string>[^<]*<\/string>/<string>$NEW_VERSION<\/string>/;}" "$INFO_PLIST"
# Update CFBundleVersion
sed -i '' "/<key>CFBundleVersion<\/key>/{n;s/<string>[^<]*<\/string>/<string>$NEW_BUILD_NUMBER<\/string>/;}" "$INFO_PLIST"
print_success "Updated Info.plist"

# Update Android build.gradle
print_status "Updating Android build.gradle..."
# Update versionCode
sed -i '' "s/versionCode [0-9]*/versionCode $NEW_BUILD_NUMBER/g" "$ANDROID_BUILD_GRADLE"
# Update versionName
sed -i '' "s/versionName \"[^\"]*\"/versionName \"$NEW_VERSION\"/g" "$ANDROID_BUILD_GRADLE"
print_success "Updated Android build.gradle"

# Verify updates
print_status "Verifying updates..."

# Check app.json
if grep -q "\"version\": \"$NEW_VERSION\"" "$APP_JSON" && 
   grep -q "\"runtimeVersion\": \"$NEW_VERSION\"" "$APP_JSON" &&
   grep -q "\"versionCode\": $NEW_BUILD_NUMBER" "$APP_JSON" && 
   grep -q "\"buildNumber\": \"$NEW_BUILD_NUMBER\"" "$APP_JSON"; then
    print_success "app.json updated correctly"
else
    print_error "app.json update verification failed"
    exit 1
fi

# Check SettingsScreen.tsx
if grep -q "description=\"$NEW_VERSION\"" "$SETTINGS_SCREEN"; then
    print_success "SettingsScreen.tsx updated correctly"
else
    print_error "SettingsScreen.tsx update verification failed"
    exit 1
fi

# Check Info.plist
if grep -A1 "<key>CFBundleShortVersionString</key>" "$INFO_PLIST" | grep -q "<string>$NEW_VERSION</string>" && 
   grep -A1 "<key>CFBundleVersion</key>" "$INFO_PLIST" | grep -q "<string>$NEW_BUILD_NUMBER</string>"; then
    print_success "Info.plist updated correctly"
else
    print_error "Info.plist update verification failed"
    exit 1
fi

# Check Android build.gradle
if grep -q "versionCode $NEW_BUILD_NUMBER" "$ANDROID_BUILD_GRADLE" && 
   grep -q "versionName \"$NEW_VERSION\"" "$ANDROID_BUILD_GRADLE"; then
    print_success "Android build.gradle updated correctly"
else
    print_error "Android build.gradle update verification failed"
    exit 1
fi

# Clean up backups
print_status "Cleaning up backups..."
rm "${APP_JSON}.backup" "${SETTINGS_SCREEN}.backup" "${INFO_PLIST}.backup" "${ANDROID_BUILD_GRADLE}.backup"

print_success "Version update completed successfully!"
print_status "Summary:"
echo "  Version: $NEW_VERSION"
echo "  Runtime Version: $NEW_VERSION"
echo "  Build Number: $NEW_BUILD_NUMBER"
echo "  Files updated: app.json, SettingsScreen.tsx, Info.plist, Android build.gradle"
echo ""
print_status "Next steps:"
echo "  1. Test the app to ensure everything works correctly"
echo "  2. Commit the changes: git add . && git commit -m 'Bump version to $NEW_VERSION'"
echo "  3. Build and deploy as needed"