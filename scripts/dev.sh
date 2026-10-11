#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/build-web.sh
export DEV_AUTH=1
export BIND_ADDR=127.0.0.1:3000
export APP_ORIGIN=http://127.0.0.1:3000
cargo run --locked -p server
