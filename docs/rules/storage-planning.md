# Storage Planning 25.30

Improve rival storage planning while retaining24.29 human rules, including the corrected remote nearest-relic Probe. Canonical anchors: `#resources`, `#computer-rivals`, `#buy`, `#victory`.

The old guard required11–12 resources to buy storage at capacity10. Instead, forecast overflow from current holdings and public production, and reserve a feasible purchase mix. Protect the next Colony/excavation payment for active units, or the first Shipyard. Use a short horizon that shrinks near victory. Buy only through normal legal Operations/Buy actions, before other Buy spending or an otherwise useful stockpile conversion. Never upgrade during an unresolved overflow choice. Funding conversions retain the payment for their selected order in both headless and browser play. Human resource choices stay unchanged.

Budget: horizon clamp(ceil((20−public leader score)/4),1,4); no purchase once a leader has20. Forecast pressure is stored resources plus public production and an impending stockpile gain, minus capacity. Buy only if min(5,pressure)×horizon exceeds the sum of the escalating price, while preserving the scoring payment. Free storage raises capacity without raising paid prices. Prices and horizon bound investment; no arbitrary capacity30 ceiling.

Archive24.29 browser rules/manual and native policy20. Use save25/rules30/native21 on a new preview. Older pinned games retain their policies.

## Evaluation fixed before rerunning

The interrupted draft's partial results used world-bound Probe. They cannot answer balance under the corrected Probe rule and will not be reused. Keep its planner weights unchanged. Evaluate both old and new storage decisions under identical25.30 human rules and nearest-Probe behavior. Use unseen seed blocks4000–4031, all seat rotations and duplicated strategy lineups:432 games per policy (384 mixed,48 mirrors), plus192 same-rule head-to-head games on blocks4100–4115. Run +2-resource gifts at rounds1/10 in each resource for96 matched mixed controls per policy (blocks4000–4007),1536 interventions total. Total2592 trials. Report round100 cutoffs without invented winners. Bootstrap whole map/seed blocks10000 times; distinguish storage expenditure from other useful spending and report eight gift contrasts with simultaneous uncertainty. No post-freeze tuning toward equal strategy shares.
