# Scoring Bots experiment

Establish this policy before implementation. Human legal actions, topology, costs, combat, resource production, scoring and the 10-point victory rule remain exactly as in 20.25. Stronger AI changes ongoing opposition, so isolate this as 21.26 with save format 21 and policy 17. Preserve the complete 20.25 browser bundle and native policy 16.

## Intended behavior

1. Take legal immediate scoring actions: colonize or capture with a Settler; excavate with an Explorer. Fund these before discretionary construction. Use only the ordinary conversion and banking rules.
2. Give every Settler a Colony goal, including Military Settlers. Send pure combat groups toward favorable public fights or useful conquests. Avoid repeated occupations that cannot score. Do not let Explorer travel monopolize every Move order when Settlers can make progress.
3. Coordinate units: do not move an Explorer off its relic while waiting for Excavate, or a Settler off its Colony site while waiting for Colonize. Do not produce more Explorers after public relic rewards are exhausted. Account for allies already heading to goals.
4. Build the first Shipyard, then support an affordable scoring plan with Settlers, Explorers, fleets or scarce-resource production. Extra Shipyards, harvesters and storage are means to score, not point sources.
5. Keep a functional deck. Preserve enough movement and construction; prefer useful movement/Colony cards and real implemented effects; skip purchases with little marginal value. Do not trash the last needed order or hoard dozens of storage upgrades. Do not read draw order.
6. Keep all information limits. Terrain and units are public; use own private signals only. Combat estimates may use public pieces and tactics, never hidden commitments or enemy regular hands.

Browser profile identity stays meaningful: Military values favorable fights and captures; Economy develops productive capacity to fund points; Expansion gives Colony expansion more weight. All profiles use every legal scoring source. Native arena policy 17 likewise removes obsolete infrastructure/card incentives and favors scoring paths; it remains a separate policy implementation from local browser rivals.

Development pilot clarification: once all thirteen worlds have owners, every profile must continue to commission Settlers for captures. Public hostile intermediate hexes may be planned through only when the moving group can handle the fight, and each actual Move must stop at the first hostile hex. Fleets can open such a route for an existing Settler. Rivals also reinforce against visible nearby enemy Fleets instead of repeatedly offering a lone defender.

## Validation and simulation plan

Use development seeds outside the earlier evaluation range to fix implementation defects and check legal, meaningful progress. Freeze the policy before evaluating. Rerun the 64 evaluation seeds from the 20.25 study with all three duplicated-profile lineups, every seat rotation and mirror games (864 games). Use identical initial maps, resource tiles, decks and markets after normalizing only version metadata. Repeat the 32-seed resource-bonus suite (3,072 games) and 16-seed 300-round sensitivity check (192 games), reporting unfinished games without invented winners.

Add matched two-new/two-old head-to-head games for each profile, rotating the old/new allocation through seats. Old bots must use the exact archived 20.25 policy on the same live state and public-information rules. Record scoring, finish times, Colony/relic/combat activity, resource flows and seed-block confidence intervals. Improvement means better scoring/completion and beating the old counterpart; a more even all-new win share alone is insufficient.

Focused tests cover immediate points before infrastructure, Military neutral colonization, Explorer/Settler movement scheduling, holding scoring positions, deck composition, bounded storage, legal paths, private-information invariance and frozen 20.25 engines/policies. Simulation observers must match unobserved trajectories and close all resource/score ledgers.

Rules grounding: canonical `rulebook.html#computer-rivals`, `#movement`, `#building`, `#excavation`, `#resources`, `#buy`, `#combat` and `#victory`.

The old browser resource-funding helper omitted the wildcard part of Trade Consortium conversion. Policy21 uses the ordinary conversion primitive, so converting it gains the same 2 Data as a human conversion. This is an explicit AI-conversion correction; the human card effect and price are unchanged. Historical20.25 controls retain the recorded old helper.
