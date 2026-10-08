#!/usr/bin/env bash
#
# Builds the two native StreamCast Pro Android apps (Kotlin + Jetpack Compose):
#   listener -> StreamCast Pro          (pro.streamcast.listener)
#   admin    -> StreamCast Control Room (pro.streamcast.controlroom)
#
# Each one is built twice, so you get four files:
#   streamcast-listener-debug.apk    streamcast-listener-release.apk
#   streamcast-admin-debug.apk       streamcast-admin-release.apk
#
# Run it through the toolchain image:
#
#   docker compose -f docker-compose.mobile.yml run --rm android
#
# API_BASE_URL is the API origin the apps call — the single value to change when they
# move onto their own domain. It is baked into the build and never committed.
set -euo pipefail

if [ -z "${API_BASE_URL:-}" ]; then
  API_BASE_URL="https://8000-${BASE44_PUBLIC_HOST_SUFFIX:?set API_BASE_URL or BASE44_PUBLIC_HOST_SUFFIX}"
fi
export API_BASE_URL="${API_BASE_URL%/}"

OUT_DIR="${OUT_DIR:-/app/web/public/downloads}"
KEYSTORE="${KEYSTORE_DIR:-/keys}/streamcast-dev.jks"
KEY_PASS="${ANDROID_KEYSTORE_PASSWORD:-streamcast-dev}"
KEY_ALIAS="streamcast"

echo "==> Building against the API at $API_BASE_URL"

# Development signing key, created once and kept in the 'keystore' volume so
# later builds can update the APKs already installed. Replace it with a key you
# own before publishing anywhere real.
if [ ! -f "$KEYSTORE" ]; then
  echo "==> Creating the development signing key"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEY_PASS" -keypass "$KEY_PASS" \
    -dname "CN=StreamCast Pro (development), O=StreamCast Pro, C=NG"
fi

mkdir -p "$OUT_DIR"
cd /app/mobile/native

build_app() {
  local name="$1" module="$2"

  echo "==> $module: assembling the debug APK"
  gradle --no-daemon --console=plain ":${module}:assembleDebug"

  echo "==> $module: assembling the signed release APK"
  gradle --no-daemon --console=plain ":${module}:assembleRelease" \
    -Pandroid.injected.signing.store.file="$KEYSTORE" \
    -Pandroid.injected.signing.store.password="$KEY_PASS" \
    -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$KEY_PASS"

  cp "${module}/build/outputs/apk/debug/${module}-debug.apk" "$OUT_DIR/streamcast-$name-debug.apk"
  cp "${module}/build/outputs/apk/release/${module}-release.apk" "$OUT_DIR/streamcast-$name-release.apk"
}

build_app listener listener
build_app admin admin

echo "==> APKs ready in $OUT_DIR"
ls -lh "$OUT_DIR"/*.apk
