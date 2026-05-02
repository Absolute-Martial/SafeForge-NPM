#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm install --silent

# Ensure the Docker verify image exists (needed for test verification)
if ! docker image inspect safeforge-npm-verify >/dev/null 2>&1; then
  echo "[engine] Building safeforge-npm-verify Docker image..."
  docker build -t safeforge-npm-verify -f Dockerfile.verify . || {
    echo "[engine] WARNING: Failed to build safeforge-npm-verify image. Test verification will be skipped."
  }
else
  echo "[engine] safeforge-npm-verify Docker image: OK"
fi

# Run in its own process group so we can kill the entire tree
set -m

cleanup() {
  echo -e "\nShutting down engine..."
  # Kill the entire process group (npx -> tsx -> node)
  kill -- -"$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM EXIT

npx tsx src/index.ts &
PID=$!
wait "$PID"
