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
cp prototypes/galactic-reach/styles.css prototypes/galactic-reach/palette.css dist/galactic-reach/
cp prototypes/galactic-reach/card-feel.js prototypes/galactic-reach/card-feel.css dist/galactic-reach/
# On-table guidance and the Learn to play walkthrough (index.html?tutorial=1).
cp prototypes/galactic-reach/guide.js prototypes/galactic-reach/guide.css prototypes/galactic-reach/tutorial.js dist/galactic-reach/
cp prototypes/galactic-reach/rulebook.html prototypes/galactic-reach/rulebook.css dist/galactic-reach/
cp prototypes/galactic-reach/app.js dist/galactic-reach/app.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/
cp prototypes/galactic-reach/change-queue.js prototypes/galactic-reach/change-queue.css dist/galactic-reach/
cp prototypes/galactic-reach/table.js dist/galactic-reach/table.js
cp prototypes/galactic-reach/cards.html dist/galactic-reach/cards.html
# Card art (NGA open-access works, CC0) and its credits manifest; the card gallery lists them.
rm -rf dist/galactic-reach/card-art && cp -R prototypes/galactic-reach/card-art dist/galactic-reach/card-art
cp prototypes/galactic-reach/shared.js dist/galactic-reach/shared.js
cp prototypes/galactic-reach/tabletop-controls.js prototypes/galactic-reach/tabletop-controls.css dist/galactic-reach/
cp prototypes/galactic-reach/market-drawer.css dist/galactic-reach/
cp prototypes/galactic-reach/replay.js dist/galactic-reach/replay.js
cp prototypes/lab/index.html dist/index.html
cp prototypes/lab/index.html dist/lab/index.html
cp prototypes/lab/lab.css prototypes/lab/lab.js prototypes/lab/replay.js dist/lab/
# The emblem: the hanging astrolabe, its round version, and its reductions for the header (mark) and the favicon.
cp prototypes/lab/heirs-emblem.svg prototypes/lab/heirs-emblem-round.svg prototypes/lab/heirs-emblem-mark.svg prototypes/lab/heirs-emblem-favicon.svg dist/lab/

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

# Preserve the full16.21 browser for pinned games and replays.
mkdir -p dist/galactic-reach/rules/16.21
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v16-$asset" "dist/galactic-reach/rules/16.21/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/16.21/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/16.21/

# Preserve the complete Ten Prestige browser for existing tables and replays.
mkdir -p dist/galactic-reach/rules/17.22
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v17-$asset" "dist/galactic-reach/rules/17.22/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/17.22/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/17.22/

# Preserve the complete Central Frontier browser for existing tables and replays.
mkdir -p dist/galactic-reach/rules/18.23
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v18-$asset" "dist/galactic-reach/rules/18.23/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/18.23/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/18.23/

# Preserve the complete Game Reports browser for pinned tables and replays.
mkdir -p dist/galactic-reach/rules/19.24
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v19-$asset" "dist/galactic-reach/rules/19.24/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/19.24/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/19.24/

# Preserve Open Worlds browser engines and manuals for pinned tables/replays.
mkdir -p dist/galactic-reach/rules/20.25
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v20-$asset" "dist/galactic-reach/rules/20.25/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/20.25/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/20.25/

# Preserve Scoring Bots, its discovery rules and bank-button UI for pinned games.
mkdir -p dist/galactic-reach/rules/21.26
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v21-$asset" "dist/galactic-reach/rules/21.26/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/21.26/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/21.26/

mkdir -p dist/galactic-reach/rules/22.27
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v22-$asset" "dist/galactic-reach/rules/22.27/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/22.27/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/22.27/

mkdir -p dist/galactic-reach/rules/23.28
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v23-$asset" "dist/galactic-reach/rules/23.28/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/23.28/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/23.28/

mkdir -p dist/galactic-reach/rules/24.29
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v24-$asset" "dist/galactic-reach/rules/24.29/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/24.29/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/24.29/

mkdir -p dist/galactic-reach/rules/25.30
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v25-$asset" "dist/galactic-reach/rules/25.30/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/25.30/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/25.30/

# Keep26.31 tables and replays on their original immediate-discard rules.
mkdir -p dist/galactic-reach/rules/26.31
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js; do
  cp "crates/galactic-reach/rules/v26-$asset" "dist/galactic-reach/rules/26.31/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/26.31/table.js
cp prototypes/galactic-reach/playtest-notes.js prototypes/galactic-reach/playtest-notes.css dist/galactic-reach/rules/26.31/

# Preserve the exact27.32 tabletop browser and shared resource-storage rules.
mkdir -p dist/galactic-reach/rules/27.32
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css; do
  cp "crates/galactic-reach/rules/v27-$asset" "dist/galactic-reach/rules/27.32/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/27.32/table.js

# Preserve 28.33 resource-capacity choices, stacking and occupation for pinned games.
mkdir -p dist/galactic-reach/rules/28.33
for asset in app.js adapter.js index.html styles.css replay.js rulebook.html rulebook.css playtest-notes.js playtest-notes.css; do
  cp "crates/galactic-reach/rules/v28-$asset" "dist/galactic-reach/rules/28.33/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/28.33/table.js
# Preserve the exact 29.34 Streamlined Operations browser (Buy upgrades/trash from hand or discard only).
mkdir -p dist/galactic-reach/rules/29.34
for asset in app.js adapter.js index.html styles.css replay.js rulebook.html rulebook.css playtest-notes.js playtest-notes.css; do
  cp "crates/galactic-reach/rules/v29-$asset" "dist/galactic-reach/rules/29.34/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/29.34/table.js

# Preserve the exact 30.35 In-play Buy browser (old market, fixed 20-point target, shared tables).
mkdir -p dist/galactic-reach/rules/30.35
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js; do
  cp "crates/galactic-reach/rules/v30-$asset" "dist/galactic-reach/rules/30.35/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/30.35/table.js

# Preserve the exact 31.36 Capacity Cards browser (original card costs, Harvester 1).
mkdir -p dist/galactic-reach/rules/31.36
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js; do
  cp "crates/galactic-reach/rules/v31-$asset" "dist/galactic-reach/rules/31.36/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/31.36/table.js
cp crates/galactic-reach/rules/v33-cards.html dist/galactic-reach/rules/31.36/cards.html
# Preserve the exact 32.37 Cheaper Cards browser and shared-table engine.
mkdir -p dist/galactic-reach/rules/32.37
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js cards.html; do
  cp "crates/galactic-reach/rules/v32-$asset" "dist/galactic-reach/rules/32.37/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/32.37/table.js

# Preserve the exact 33.38 Split Moves browser and shared-table engine.
mkdir -p dist/galactic-reach/rules/33.38
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js cards.html; do
  cp "crates/galactic-reach/rules/v33-$asset" "dist/galactic-reach/rules/33.38/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/33.38/table.js

# Preserve the exact 37.42 Integrated Playtest browser and shared-table engine.
mkdir -p dist/galactic-reach/rules/37.42
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js cards.html; do
  cp "crates/galactic-reach/rules/v37-$asset" "dist/galactic-reach/rules/37.42/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/37.42/table.js

# Preserve the exact 38.43 Construct III Playtest browser and shared-table engine.
mkdir -p dist/galactic-reach/rules/38.43
for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js cards.html; do
  cp "crates/galactic-reach/rules/v38-$asset" "dist/galactic-reach/rules/38.43/$asset"
done
cp prototypes/galactic-reach/table.js dist/galactic-reach/rules/38.43/table.js

# Testnet seat (Nido + zero-knowledge private draws) for the current tabletop.
# The Docker image builds it in its own Node stage and sets SKIP_ZK_SEAT=1 here.
if [ -z "${SKIP_ZK_SEAT:-}" ]; then
  ./zk/build-web.sh "$PWD/dist/galactic-reach/zk"
fi


# Preserve all independently published workstation revisions for pinned games.
for format in 34 35 36; do
  revision=$((format+5))
  mkdir -p "dist/galactic-reach/rules/$format.$revision"
  for asset in app.js adapter.js index.html styles.css rulebook.html rulebook.css replay.js playtest-notes.js playtest-notes.css shared.js cards.html; do
    cp "crates/galactic-reach/rules/v$format-$asset" "dist/galactic-reach/rules/$format.$revision/$asset"
  done
  cp prototypes/galactic-reach/table.js "dist/galactic-reach/rules/$format.$revision/table.js"
done
