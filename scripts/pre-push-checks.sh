#!/bin/sh
set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"

echo "==> Preparing isolated local D1 for E2E"
if ! rg -q '^CLERK_SECRET_KEY=.+$' .dev.vars; then
  echo "Set CLERK_SECRET_KEY in .dev.vars to run the CI-equivalent E2E suite." >&2
  exit 1
fi
mise run e2e-prepare

echo "==> Building Public Worker assets for E2E"
PUBLIC_EVENTS_JSON="$(cat frontend/e2e/fixtures/public-events.json)" mise run build-public

echo "==> Running Playwright E2E tests"
(cd frontend && mise exec -- pnpm --filter @go-tickets/e2e test)
