#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"

echo "==> Installing pinned tools and frontend dependencies"
mise install
(
  cd frontend
  mise exec -- pnpm install --frozen-lockfile
  mise exec -- pnpm --filter @go-tickets/e2e exec playwright install chromium
)

echo "==> Running lint, format, typecheck, and unit tests"
(cd backend && mise exec -- golangci-lint run ./...)
(cd backend && mise exec -- go tool go-arch-lint check --project-path .)
(cd frontend && mise exec -- pnpm run lint)
(cd frontend && mise exec -- pnpm run format:check)
(cd frontend && mise exec -- pnpm run typecheck)
(cd backend && mise exec -- go test ./...)
(cd frontend && mise exec -- pnpm test)

echo "==> Auditing frontend dependencies"
(cd frontend && mise exec -- pnpm audit --audit-level=high)

echo "==> Building Workers and checking Wrangler bundles"
(
  cd frontend
  PUBLIC_EVENTS_JSON='[]' mise exec -- pnpm --filter @go-tickets/public build
  mise exec -- pnpm --filter @go-tickets/admin build
)
(
  cd backend
  mise exec -- go tool workers-assets-gen -mode=go -o build/public
  mv build/public/worker.mjs build/public/worker-runtime.mjs
  mise exec -- env GOOS=js GOARCH=wasm go build -trimpath -buildvcs=false -ldflags='-s -w' -o build/public/app.wasm ./cmd/public
  mise exec -- go tool workers-assets-gen -mode=go -o build/admin
  mv build/admin/worker.mjs build/admin/worker-runtime.mjs
  mise exec -- env GOOS=js GOARCH=wasm go build -trimpath -buildvcs=false -ldflags='-s -w' -o build/admin/app.wasm ./cmd/admin
)
(
  cd frontend
  mise exec -- wrangler deploy --config ../wrangler.public.jsonc --dry-run --outdir ../backend/build/dry-public
  mise exec -- wrangler deploy --config ../wrangler.admin.jsonc --dry-run --outdir ../backend/build/dry-admin
)

echo "==> Preparing isolated local D1 for E2E"
if ! rg -q '^CLERK_SECRET_KEY=.+$' .dev.vars; then
  echo "Set CLERK_SECRET_KEY in .dev.vars to run the CI-equivalent E2E suite." >&2
  exit 1
fi
rm -rf .wrangler/e2e
(
  cd backend
  mise exec -- wrangler d1 migrations apply go-tickets --config ../wrangler.public.jsonc --local --persist-to ../.wrangler/e2e
  mise exec -- wrangler d1 execute go-tickets --config ../wrangler.public.jsonc --local --persist-to ../.wrangler/e2e --file scripts/seed-local.sql
)

echo "==> Building E2E Worker assets"
(
  cd frontend
  PUBLIC_EVENTS_JSON="$(cat e2e/fixtures/public-events.json)" mise exec -- pnpm --filter @go-tickets/public build
)
(
  cd backend
  mise exec -- go tool workers-assets-gen -mode=go -o build/public
  mv build/public/worker.mjs build/public/worker-runtime.mjs
  mise exec -- env GOOS=js GOARCH=wasm go build -trimpath -buildvcs=false -ldflags='-s -w' -o build/public/app.wasm ./cmd/public
)

echo "==> Running E2E tests"
(cd frontend && mise exec -- pnpm --filter @go-tickets/e2e test)
