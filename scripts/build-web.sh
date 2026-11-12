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
cp prototypes/galactic-reach/rulebook.html prototypes/galactic-reach/rulebook.css dist/galactic-reach/
cp prototypes/galactic-reach/app.js dist/galactic-reach/app.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/
cp prototypes/galactic-reach/table.js dist/galactic-reach/table.js
cp prototypes/galactic-reach/replay.js dist/galactic-reach/replay.js
cp prototypes/lab/index.html dist/index.html
cp prototypes/lab/index.html dist/lab/index.html
cp prototypes/lab/lab.css prototypes/lab/lab.js prototypes/lab/replay.js dist/lab/

# Preserve the complete v4 through v10 browsers alongside v11; tables never upgrade implicitly.
mkdir -p dist/galactic-reach/rules/4.9
cp crates/galactic-reach/rules/v4-app.js dist/galactic-reach/rules/4.9/app.js
cp crates/galactic-reach/rules/v4-styles.css dist/galactic-reach/rules/4.9/styles.css
cp crates/galactic-reach/rules/v4-index.html dist/galactic-reach/rules/4.9/index.html
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/4.9/table.js
cp prototypes/galactic-reach/replay.js dist/galactic-reach/rules/4.9/replay.js

mkdir -p dist/galactic-reach/rules/5.10
cp crates/galactic-reach/rules/v5-app.js dist/galactic-reach/rules/5.10/app.js
cp crates/galactic-reach/rules/v5-styles.css dist/galactic-reach/rules/5.10/styles.css
cp crates/galactic-reach/rules/v5-index.html dist/galactic-reach/rules/5.10/index.html
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/5.10/table.js

# 6.11 includes its own manual and live-table replay viewer.
mkdir -p dist/galactic-reach/rules/6.11
for asset in app.js styles.css index.html replay.js rulebook.html rulebook.css; do
  cp "crates/galactic-reach/rules/v6-$asset" "dist/galactic-reach/rules/6.11/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/6.11/table.js

# Preserve the parent Pass & Buy experiment for pinned tables and replays.
mkdir -p dist/galactic-reach/rules/7.12
for asset in app.js styles.css index.html replay.js rulebook.html rulebook.css; do
  cp "crates/galactic-reach/rules/v7-$asset" "dist/galactic-reach/rules/7.12/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/7.12/table.js

# Preserve the Resource Actions experiment for its existing tables and replays.
mkdir -p dist/galactic-reach/rules/8.13
for asset in app.js styles.css index.html replay.js rulebook.html rulebook.css; do
  cp "crates/galactic-reach/rules/v8-$asset" "dist/galactic-reach/rules/8.13/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/8.13/table.js

# Keep the previous local Settlers & Explorers rules available for pinned tables.
mkdir -p dist/galactic-reach/rules/9.14
for asset in app.js styles.css index.html replay.js rulebook.html rulebook.css; do
  cp "crates/galactic-reach/rules/v9-$asset" "dist/galactic-reach/rules/9.14/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/9.14/table.js

# Preserve the Fleet & Storage experiment for pinned tables and recorded matches.
mkdir -p dist/galactic-reach/rules/10.15
for asset in app.js styles.css index.html replay.js rulebook.html rulebook.css; do
  cp "crates/galactic-reach/rules/v10-$asset" "dist/galactic-reach/rules/10.15/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/10.15/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/10.15/

# Keep 11.16 tables and replays on the full Alien Relics implementation.
mkdir -p dist/galactic-reach/rules/11.16
for asset in app.js styles.css index.html replay.js rulebook.html rulebook.css; do
  cp "crates/galactic-reach/rules/v11-$asset" "dist/galactic-reach/rules/11.16/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/11.16/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/11.16/

# Keep the full 12.17 browser for existing tables and replays.
mkdir -p dist/galactic-reach/rules/12.17
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v12-$asset" "dist/galactic-reach/rules/12.17/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/12.17/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/12.17/

# Preserve the complete 13.18 browser for pinned tables and replays.
mkdir -p dist/galactic-reach/rules/13.18
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v13-$asset" "dist/galactic-reach/rules/13.18/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/13.18/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/13.18/

# Preserve14.19 before the combat rules experiment; pinned games never upgrade.
mkdir -p dist/galactic-reach/rules/14.19
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v14-$asset" "dist/galactic-reach/rules/14.19/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/14.19/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/14.19/

# Preserve the full15.20 combat/Relics browser for pinned games and replays.
mkdir -p dist/galactic-reach/rules/15.20
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v15-$asset" "dist/galactic-reach/rules/15.20/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/15.20/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/15.20/
