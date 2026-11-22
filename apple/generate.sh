#!/bin/sh
# Generates Cauldron.xcodeproj, injecting machine-specific values from .env (see .env.example).
set -e
here="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$here/.env" ]; then set -a; . "$here/.env"; set +a; fi
export CAULDRON_URL="${CAULDRON_URL:-}" DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM:-}" BUNDLE_PREFIX="${BUNDLE_PREFIX:-com.example}"
cd "$here"
xcodegen generate "$@"
