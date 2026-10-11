#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .tools/bin/wasm-bindgen ]; then
  cargo install wasm-bindgen-cli --version 0.2.114 --locked --root .tools
fi
cargo build --locked -p web --target wasm32-unknown-unknown --release
mkdir -p dist/pkg
.tools/bin/wasm-bindgen target/wasm32-unknown-unknown/release/web.wasm --target web --out-dir dist/pkg
cp crates/web/index.html dist/index.html
cp crates/web/style.css dist/style.css
