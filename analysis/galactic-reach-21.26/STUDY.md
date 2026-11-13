# Scoring Bots 21.26 evaluation

The only intervention is opponent policy. Keep the exact 20.25 human mechanics, approved world geometry, randomized moons, resources, decks, market, prices, combat, score sources and 10-point victory. Version21.26 isolates the changed opposition; complete20.25 engines and policy16 remain archived.

Development pilots use seeds `20261111 + n * 7919` for `n=0..3`, outside the evaluation range. Fix legal/progression defects there and in focused fixtures; do not tune to make the evaluation strategy win shares equal. Freeze the engine SHA256 before the evaluation. The runner refuses a different source hash. Commit identity and engine/adapter/harness hashes accompany each suite.

## Prespecified evaluation

- Repeat the earlier64 evaluation seed blocks2000–2063, three duplicated-profile lineups and all four seat rotations:768 mixed games. Add96 same-profile mirror games.
- Repeat the32-block resource-bonus experiment:384 matched controls reused from the main suite, with +2 of each resource at round1 or10, for3,072 additional games.
- Repeat the first16 blocks'192 mixed games to300 rounds to diagnose delayed finishes.
- Add384 head-to-head games:32 seed blocks, each of the three profiles at all four seats, with two old and two new policy instances. Rotate which seats receive each generation four ways. Improvement requires beating the old counterpart and better scoring/completion, not merely changing the all-new strategy shares.

Total:4,512 evaluated trials, plus the reused20.25 baseline. Research cutoffs are100 rounds/50,000 decisions, or300 rounds for the long suite. An unfinished game never earns an invented win or loss. Bootstrap entire seed blocks for95% intervals; resource analyses also report multiplicity-adjusted intervals and censoring bounds.

Initial state is identical to the old study after normalizing only save/rules version metadata. Verify full-state fingerprints, maps, cards and RNG calls. Capture resource ledgers, spending, overflow, shortages, early/middle/late flows, scoring and unit/Colony/relic milestones as before.

The head-to-head harness imports the exact archived20.25 policy closure into the same game state. Both generations share one gameplay RNG and card-ID counter. Old/new actors use their own overflow, Operations and Buy policies; combat decisions retain the same public-information chooser. Initialization of the unused old state consumes an isolated throwaway RNG. All-old hybrid runs must reproduce the archived engine exactly, including resource ledgers and RNG calls. Observer-free hybrid runs must match observed runs, and card IDs must remain globally unique.

Historical AI conversion omitted Trade Consortium's wildcard gain. Preserve that behavior in the old control; the new policy follows the normal2-Data conversion. Preserve the recorded cross-world AI Industrial Surge effect in both controls. These differences are explicit, not silently inferred rule changes.

Only use public world terrain, public units/resources and the acting player's private signals/cards. Do not consult hidden moon/relic positions, enemy hands, commitments or draw order. Native policy17 has parallel scoring priorities but is a separate implementation; the strategy balance study measures local browser rivals.

Rules grounding: canonical `rulebook.html#computer-rivals`, `#movement`, `#building`, `#excavation`, `#resources`, `#buy`, `#combat`, `#victory`.
