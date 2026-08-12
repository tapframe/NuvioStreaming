#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/run-tvos.sh [device-id]

Builds, installs, and launches the native Apple TV app on a connected device.
Connect the Apple TV to the Mac with a USB-C cable, unlock or wake it, and
confirm that Xcode trusts the device before running this script.

Configuration:
  TVOS_DEVICE_ID                CoreDevice identifier. A positional value wins.
  TVOS_DEVELOPMENT_TEAM         Apple Developer team identifier.
  TVOS_BUNDLE_IDENTIFIER        App identifier. Default: com.nuvio.app.tvos.dev
  TVOS_TEST_BUNDLE_IDENTIFIER   Test identifier. Defaults to app identifier plus .tests.
  TVOS_CODE_SIGN_STYLE          Xcode signing style. Default: Automatic
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

command -v xcodegen >/dev/null 2>&1 || {
  echo "xcodegen is required. Install it with: brew install xcodegen" >&2
  exit 1
}

device_id="${1:-${TVOS_DEVICE_ID:-}}"
development_team="${TVOS_DEVELOPMENT_TEAM:-}"
bundle_id="${TVOS_BUNDLE_IDENTIFIER:-com.nuvio.app.tvos.dev}"
test_bundle_id="${TVOS_TEST_BUNDLE_IDENTIFIER:-${bundle_id}.tests}"
sign_style="${TVOS_CODE_SIGN_STYLE:-Automatic}"
derived_data="$repo_root/build/tvos-derived"
package_cache="$repo_root/build/tvos-packages"
app_path="$derived_data/Build/Products/Debug-appletvos/Nuvio.app"

if [[ -z "$device_id" ]]; then
  echo "A device identifier is required." >&2
  echo "Connect the Apple TV through USB-C and run: xcrun devicectl list devices" >&2
  echo "Then pass the identifier or set TVOS_DEVICE_ID." >&2
  exit 1
fi

if [[ -z "$development_team" ]]; then
  echo "TVOS_DEVELOPMENT_TEAM is required for a signed device build." >&2
  echo "Use the team identifier shown in Xcode Signing and Capabilities." >&2
  exit 1
fi

export TVOS_BUNDLE_IDENTIFIER="$bundle_id"
export TVOS_TEST_BUNDLE_IDENTIFIER="$test_bundle_id"

echo "Generating the NuvioTV Xcode project"
xcodegen generate --spec tvosApp/project.yml

echo "Checking connected Apple TV ($device_id)"
device_listing="$(xcrun devicectl list devices --timeout 20)"
if [[ "$device_listing" != *"$device_id"* ]]; then
  echo "The Apple TV is unavailable to CoreDevice." >&2
  echo "Wake it, reconnect the USB-C cable, and confirm the identifier." >&2
  exit 1
fi

if [[ "$device_listing" == *"$device_id"*"unavailable"* ]]; then
  echo "The Apple TV is paired but unavailable." >&2
  echo "Wake it and reconnect the USB-C cable, then rerun." >&2
  exit 1
fi

echo "Building Nuvio for Apple TV"
xcodebuild \
  -project tvosApp/NuvioTV.xcodeproj \
  -scheme NuvioTV \
  -configuration Debug \
  -destination "id=$device_id" \
  -derivedDataPath "$derived_data" \
  -clonedSourcePackagesDirPath "$package_cache" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$development_team" \
  CODE_SIGN_STYLE="$sign_style" \
  PRODUCT_BUNDLE_IDENTIFIER="$bundle_id" \
  build

if [[ ! -d "$app_path" ]]; then
  echo "Built app not found at $app_path" >&2
  exit 1
fi

echo "Installing Nuvio"
xcrun devicectl device install app --device "$device_id" "$app_path"

echo "Launching Nuvio"
xcrun devicectl device process launch \
  --device "$device_id" \
  --terminate-existing \
  "$bundle_id"
