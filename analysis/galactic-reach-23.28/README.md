# Twenty Point Strategy 23.28 balance study

This study evaluates the browser bots a solo player faces. Native arena policy 19 has separate behavior and replay tests; it is not the policy measured here.

The freeze manifest identifies the engine and study source. Development used seed blocks 1000, 1100 and 1101. Post-freeze plain-engine verification used1102 without changing policies. Evaluation uses blocks 2000–2063, three duplicated-profile mixed lineups and four seat rotations per block (768 games), plus 96 identical-profile mirrors. Each block reuses its randomized map, resource tiles, decks and market across rotations. World geometry stays fixed; moon positions vary by seed.

Conditions:

- `baseline`: immutable 22.27 rules and browser decisions, 864 games.
- `old-policy`: 22.27 decisions inside 23.28 rules, adapting only the storage-price lookup, 864 games.
- `main`: 23.28 rules and new browser decisions, 864 games.
- `headtohead`: two old and two new bots with the same profile, all sharing one 23.28 rules engine, 384 games.
- `gifts`: +2 of each resource at round 1 or 10 to a rotated focal player, with 384 matched controls per resource/timing, 3,072 games.
- `long`: 192 matched mixed games extended from round 100 to round 300.

Total: 6,240 trials. The game has no round limit. Research cutoffs are censored outcomes, never awarded wins. Confidence intervals resample whole seed blocks 10,000 times. Resource/timing effects include family-adjusted intervals for eight comparisons. The rules comparison changes scoring and storage together; it cannot identify their separate effects.

Run with Node 24, for example `node analysis/galactic-reach-23.28/run.cjs --suite main --workers 5`. Other suites use the names above. `verify.cjs` checks observer parity, shared-rules old-policy control parity, card-ID uniqueness and scoring. `analyze.py` requires NumPy. The report script additionally requires Matplotlib. Compressed raw results, metadata and hashes accompany the final report.

The metadata `commit` initially records the worktree base. The freeze manifest and engine SHA256 identify the evaluated working source; the final manifest records its published commit separately.
