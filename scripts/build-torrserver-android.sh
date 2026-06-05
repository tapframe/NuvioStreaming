#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TORRSERVER_DIR="${TORRSERVER_DIR:-"${ROOT_DIR}/vendor/TorrServer/server"}"
OUT_DIR="${OUT_DIR:-"${ROOT_DIR}/composeApp/src/androidMain/jniLibs"}"
GO_BIN="${GO_BIN:-go}"
UPX_BIN="${UPX_BIN:-upx}"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-"${HOME}/Library/Android/sdk"}}"
NDK_ROOT="${ANDROID_NDK_HOME:-}"
export GOCACHE="${GOCACHE:-"${ROOT_DIR}/build/go-cache"}"
export GOMODCACHE="${GOMODCACHE:-"${ROOT_DIR}/build/go-mod-cache"}"

if ! command -v "${GO_BIN}" >/dev/null 2>&1; then
  echo "Go toolchain not found. Install Go or set GO_BIN=/path/to/go." >&2
  exit 1
fi

if [[ ! -d "${TORRSERVER_DIR}" ]]; then
  echo "TorrServer source not found at ${TORRSERVER_DIR}" >&2
  exit 1
fi

if [[ -z "${NDK_ROOT}" ]]; then
  if [[ ! -d "${SDK_ROOT}/ndk" ]]; then
    echo "Android NDK not found. Set ANDROID_HOME, ANDROID_SDK_ROOT, or ANDROID_NDK_HOME." >&2
    exit 1
  fi
  NDK_VERSION="$(ls -1 "${SDK_ROOT}/ndk" | sort | tail -n 1)"
  NDK_ROOT="${SDK_ROOT}/ndk/${NDK_VERSION}"
fi

PREBUILT_ROOT="${NDK_ROOT}/toolchains/llvm/prebuilt"
HOST_TAG=""
for candidate in darwin-x86_64 linux-x86_64; do
  if [[ -d "${PREBUILT_ROOT}/${candidate}" ]]; then
    HOST_TAG="${candidate}"
    break
  fi
done

if [[ -z "${HOST_TAG}" ]]; then
  echo "Could not find an LLVM prebuilt toolchain under ${PREBUILT_ROOT}" >&2
  exit 1
fi

TOOLCHAIN="${PREBUILT_ROOT}/${HOST_TAG}"
LDFLAGS="${LDFLAGS:-"-s -w -checklinkname=0"}"
BUILD_FLAGS=(-tags=nosqlite -trimpath -ldflags="${LDFLAGS}")
mkdir -p "${GOCACHE}" "${GOMODCACHE}"

build_abi() {
  local abi="$1"
  local goarch="$2"
  local goarm="$3"
  local triple="$4"
  local api_level="$5"
  local cc="${TOOLCHAIN}/bin/${triple}${api_level}-clang"
  local cxx="${TOOLCHAIN}/bin/${triple}${api_level}-clang++"
  local output="${OUT_DIR}/${abi}/libtorrserver.so"

  if [[ ! -x "${cc}" ]]; then
    echo "Compiler not found: ${cc}" >&2
    exit 1
  fi

  mkdir -p "$(dirname "${output}")"
  echo "Building ${abi} -> ${output}"

  local env_vars=(
    GOOS=android
    GOARCH="${goarch}"
    CGO_ENABLED=1
    CC="${cc}"
    CXX="${cxx}"
  )
  if [[ -n "${goarm}" ]]; then
    env_vars+=(GOARM="${goarm}")
  fi

  (
    cd "${TORRSERVER_DIR}"
    env "${env_vars[@]}" "${GO_BIN}" build "${BUILD_FLAGS[@]}" -o "${output}" ./cmd
  )
  chmod 755 "${output}"
  if [[ "${USE_UPX:-0}" == "1" ]] && command -v "${UPX_BIN}" >/dev/null 2>&1; then
    "${UPX_BIN}" -q "${output}" || echo "UPX compression failed for ${output}; leaving uncompressed" >&2
  fi
}

build_abi "arm64-v8a" "arm64" "" "aarch64-linux-android" "21"
build_abi "armeabi-v7a" "arm" "7" "armv7a-linux-androideabi" "21"
build_abi "x86" "386" "" "i686-linux-android" "21"
build_abi "x86_64" "amd64" "" "x86_64-linux-android" "21"

echo "TorrServer Android binaries updated in ${OUT_DIR}"
