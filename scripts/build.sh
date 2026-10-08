#!/bin/sh
set -eu
worker=${1:?usage: scripts/build.sh public|admin}
case "$worker" in public|admin) ;; *) exit 2;; esac
go run github.com/syumai/workers-go/cmd/workers-assets-gen -mode=go -o "build/$worker"
GOOS=js GOARCH=wasm go build -trimpath -ldflags='-s -w' -o "build/$worker/app.wasm" "./cmd/$worker"
