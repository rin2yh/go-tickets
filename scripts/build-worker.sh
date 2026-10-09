#!/bin/sh
set -eu

app="${1:-}"

case "$app" in
  public|admin) ;;
  *)
    echo "Usage: $0 <public|admin>" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/.."

pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend run "build:$app"

cd backend

go tool workers-assets-gen -mode=go -o "build/$app"
mv "build/$app/worker.mjs" "build/$app/worker-runtime.mjs"

GOOS=js GOARCH=wasm go build \
  -trimpath \
  -buildvcs=false \
  -ldflags="-s -w" \
  -o "build/$app/app.wasm" \
  "./cmd/$app"
