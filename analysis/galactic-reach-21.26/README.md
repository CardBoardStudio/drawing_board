# Scoring Bots21.26 evaluation

Run from the repository root with Node24+ and Python3 with NumPy and Matplotlib. Read `STUDY.md` for the frozen design and `docs/rules/scoring-bots.md` for the intended policy. Production engine hashes are enforced. Development pilots use separate seeds.

```sh
node analysis/galactic-reach-21.26/verify.cjs
node analysis/galactic-reach-21.26/run.cjs --suite main --workers 8
node analysis/galactic-reach-21.26/run.cjs --suite gifts --workers 8
node analysis/galactic-reach-21.26/run.cjs --suite long --workers 4
node analysis/galactic-reach-21.26/run.cjs --suite headtohead --workers 4
python3 analysis/galactic-reach-21.26/analyze.py
python3 analysis/galactic-reach-21.26/report.py
```

Analysis reuses the canonical prior `analysis/galactic-reach-20.25/main.jsonl.gz` if present. Otherwise regenerate the864 old controls from the preserved exact20.25 engine:

```sh
node analysis/galactic-reach-21.26/run.cjs --suite baseline --workers 8
```

The four new suites contain4,512 trials. Workers append records in completion order; use seed/profile/rotation keys, never file order. Metadata records the commit and engine, adapter and harness hashes. `verify.cjs` checks observer parity, plain-engine parity, mixed-policy card-ID uniqueness and exact all-old shared-state parity. If prior baseline records exist it also reproduces finished and censored published trajectories and ledgers.

`summary.json` reports censored games and whole-seed-block intervals. `report.html` embeds its figures and works offline. `manifest.json` records all raw and derived hashes; compressed JSONL files are canonical portable records. Reports and raw records are local research output and are not shipped in the web build.
