#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -x .tools/bin/wasm-bindgen ]; then
  cargo install wasm-bindgen-cli --version 0.2.114 --locked --root .tools
fi
cargo build --locked -p web --target wasm32-unknown-unknown --release
mkdir -p dist/pkg
.tools/bin/wasm-bindgen target/wasm32-unknown-unknown/release/web.wasm --target web --out-dir dist/pkg
mkdir -p dist/voidwright dist/galactic-reach dist/lab
cp crates/web/index.html dist/voidwright/index.html
cp crates/web/style.css dist/style.css
cp prototypes/galactic-reach/index.html dist/galactic-reach/index.html
cp prototypes/galactic-reach/styles.css dist/galactic-reach/styles.css
cp prototypes/galactic-reach/app.js dist/galactic-reach/app.js
cp prototypes/galactic-reach/table.js dist/galactic-reach/table.js
cp prototypes/lab/index.html dist/index.html
cp prototypes/lab/index.html dist/lab/index.html
cp prototypes/lab/lab.css prototypes/lab/lab.js prototypes/lab/replay.js dist/lab/

# Preserve the complete v5 browser alongside v6; tables never upgrade implicitly.
mkdir -p dist/galactic-reach/rules/5.10
cp crates/galactic-reach/rules/v5-app.js dist/galactic-reach/rules/5.10/app.js
cp crates/galactic-reach/rules/v5-styles.css dist/galactic-reach/rules/5.10/styles.css
cp crates/galactic-reach/rules/v5-index.html dist/galactic-reach/rules/5.10/index.html
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/5.10/table.js
