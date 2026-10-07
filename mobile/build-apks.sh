#!/usr/bin/env bash
#
# Builds the two StreamCast Pro Android apps:
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
# WEB_URL is the live site the apps open — the single value to change when the
# apps move onto their own domain. It is never committed to the repo.
set -euo pipefail

if [ -z "${WEB_URL:-}" ]; then
  WEB_URL="https://3000-${BASE44_PUBLIC_HOST_SUFFIX:?set WEB_URL or BASE44_PUBLIC_HOST_SUFFIX}"
fi
export WEB_URL="${WEB_URL%/}"

OUT_DIR="${OUT_DIR:-/app/web/public/downloads}"
KEYSTORE="${KEYSTORE_DIR:-/keys}/streamcast-dev.jks"
KEY_PASS="${ANDROID_KEYSTORE_PASSWORD:-streamcast-dev}"
KEY_ALIAS="streamcast"

echo "==> Building against $WEB_URL"

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

build_app() {
  local name="$1" start_path="$2"
  cd "/app/mobile/$name"

  echo "==> $name: preparing the Capacitor project"
  npm install --no-audit --no-fund --loglevel=error
  [ -d android ] || npx cap add android
  export START_PATH="$start_path"
  npx cap sync android

  echo "==> $name: assembling the debug APK"
  (cd android && ./gradlew --no-daemon --console=plain assembleDebug)

  echo "==> $name: assembling the signed release APK"
  (cd android && ./gradlew --no-daemon --console=plain assembleRelease \
    -Pandroid.injected.signing.store.file="$KEYSTORE" \
    -Pandroid.injected.signing.store.password="$KEY_PASS" \
    -Pandroid.injected.signing.key.alias="$KEY_ALIAS" \
    -Pandroid.injected.signing.key.password="$KEY_PASS")

  cp android/app/build/outputs/apk/debug/app-debug.apk "$OUT_DIR/streamcast-$name-debug.apk"
  cp android/app/build/outputs/apk/release/app-release.apk "$OUT_DIR/streamcast-$name-release.apk"
}

build_app listener ""
build_app admin "/admin"

echo "==> APKs ready in $OUT_DIR"
ls -lh "$OUT_DIR"/*.apk
