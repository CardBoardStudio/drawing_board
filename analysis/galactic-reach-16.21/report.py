from pathlib import Path
from html import escape
import json, shutil, hashlib
ROOT=Path(__file__).resolve().parent
s=json.loads((ROOT/'summary.json').read_text());d=s['guarded']['mixed'];c=s['orderControl']
def pct(n,total):return f'{100*n/total:.1f}%'
def table(headers,rows):
    return '<div class="table"><table><thead><tr>'+''.join('<th>'+escape(str(x))+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
profiles=[]
for k in ['expansion','economy','military']:
    x=d['byStrategy'][k];a,b=x['winShareCI95']
    profiles.append([k.title(),x['wins'],f"{x['shareOfWins']:.1f}%",f'{a:.1f}–{b:.1f}%',f"{x['winRatePerAppearance']:.1f}%",f"{x['colonies']:.2f}"])
seats=[]
for k,x in c['bySeat'].items():
    a,b=x['winShareCI95'];seats.append([int(k)+1,x['wins'],f"{x['winShare']:.1f}%",f'{a:.1f}–{b:.1f}%'])
combat=json.loads((ROOT/'combat.json').read_text())['results']
combat_rows=[[r['name'],r['outcomes'].get('attacker_seizes',0),r['outcomes'].get('mutual_destruction',0),r['outcomes'].get('defender_survives',0)+r['outcomes'].get('defender_holds_attacker_retreats',0)] for r in combat]
components=d['winnerScoreComponents']
body=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galactic Reach 16.21 balance study</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;color:#243247;max-width:1000px;padding:24px;margin:auto;background:#fff}}h1,h2{{line-height:1.2;color:#122333}}h1{{font-size:34px}}h2{{margin-top:40px;font-size:24px}}p,li{{max-width:85ch}}.note{{padding:16px 20px;background:#edf4fa;border-left:4px solid #597fbe}}.table{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}}th,td{{padding:9px 12px;text-align:left;border-bottom:1px solid #dbe3ec}}th{{background:#f0f4f8}}small{{color:#526176}}img{{max-width:100%;height:auto}}code,pre{{background:#f1f4f7;padding:3px 5px;overflow:auto}}a{{color:#185ab4}}footer{{margin-top:48px;border-top:1px solid #dbe3ec;padding-top:16px}}</style>
<h1>Galactic Reach 16.21: balance study</h1>
<p><small>Study date: November 11, 2026 · Compact Frontier · Source commit <code>{s['sourceCommit']}</code></small></p>
<p class="note"><strong>Assessment:</strong> the current browser bot profiles have a large performance gap, games take many rounds, and seat effects deserve investigation. Bot defects prevent a confident conclusion about balance between equally skilled human strategies. No game rules were changed for the main tournament. <a href="seat-cause.html">The follow-up study identifies major causes of the measured seat effect.</a></p>
<h2>What was run</h2><ul>
<li>864 baseline browser-policy runs: 768 mixed-profile games and 96 identical-profile games. Three identical state transitions with no RNG consumption identify a deterministic stall.</li>
<li>The same 864 games with an analysis-only movement safeguard: choose only reachable destinations, skip blocked moves, and continue rather than repeatedly retry failed movement. All 864 finished before the 160-round cap.</li>
<li>384 additional identical-bot controls: 32 seeds × three profiles × four initial first-player markers. Maps and initial decks remain matched; all controls finished.</li>
<li>360 combat cases: ten matchups × all 36 legal three-tactic sequence pairings.</li>
<li>Four actual Rust policy-12 probes on one map with cyclic seat rotations, capped after round 40. These diagnose behavior; they are not a win-rate estimate.</li></ul>
<p>The main mixed tournament uses 64 map seeds. Each seed runs all four seat rotations for each of the three possible duplicated profiles. Each profile therefore appears in 1,024 player-seats. An equal-strength reference is 33.3% of wins per profile, or 25% wins per player appearance. Intervals below resample entire seed blocks 2,000 times.</p>
<h2>Browser profile comparison</h2>
{table(['Profile','Wins / 768','Share of wins','95% interval','Wins / appearances','Mean colonies'],profiles)}
<p>These results compare the existing heuristics with the movement safeguard. Other weaknesses, including unaffordable build priorities and limited strategic planning, remain. They do not show that an optimal military strategy loses to an optimal expansion strategy.</p>
<img src="balance.png" alt="Expansion wins 62.5%, economy 28.3%, military 9.2%; median finish round 73.">
<h2>Pacing and scoring</h2>
<p>Median game length was <strong>{d['finishRoundMedian']:g} rounds</strong>; the 10th–90th percentile range was {d['finishRoundP10']:g}–{d['finishRoundP90']:g}. Identical-profile games had a median of 89 rounds. There were {d['combatsMean']:.1f} battles per mixed game on average. Bot rounds cannot be translated directly into human session minutes.</p>
{table(['Winning score component','Mean Prestige'],[['Colonies',f"{components['colonies']:.2f}"],['Extra frontier colonies',f"{components['frontierPrestige']:.2f}"],['Shipyard pairs',f"{components['shipyardPrestige']:.2f}"],['Excavations',f"{components['relics']:.2f}"],['Purchased cards',f"{components['deckPrestige']:.2f}"]])}
<p>Winners bought {components['cardsPurchased']:.1f} cards on average. Card purchases supplied {100*components['deckPrestige']/components['prestige']:.1f}% of their final Prestige. This is a pacing and scoring signal to test with competent bots and people; it does not establish a human-optimal purchase strategy.</p>
<h2>Seat effect</h2>
<p>The main mixed tournament favored starting seat 1 (30.6% wins) over seat 3 (19.4%). The separate identical-bot control below varies the initial first-player marker while keeping the same maps and decks:</p>
{table(['Seat identity / home','Wins / 384','Win share','95% interval'],seats)}
<p>The initially first actor won {c['relativeToInitialFirstPlayer']['0']} of 384 controls ({pct(c['relativeToInitialFirstPlayer']['0'],384)}), close to the 25% reference. Thus starting first alone does not explain the seat pattern. Seat identity, initial deck allocation, home position, resource orientation and deterministic policy ordering are still coupled. Stable East-first Shipyard placement and fixed BFS tie ordering are plausible contributors. This does not prove unfair world geometry. The 96 controls with the standard initial marker exactly reproduce the corresponding earlier identical-bot results.</p>
<h2>Bot defects found</h2>
<ul><li><strong>Browser loops:</strong> 600 of 864 baseline runs stalled, including 533 of the 768 mixed games. Capacity-blocked moves and Pathfinder attempts to attack a hostile hex were reproduced. Baseline finished-only win rates are selection-biased and should not be treated as the main result.</li>
<li><strong>Arena economy/expansion lockout:</strong> in all eight tested appearances, these policies filled all six home building spaces with Harvesters by rounds 5–7. They then had no Shipyard, ships, additional Colony or excavation. Military won one probe at round 36; three probes were censored after round 40. This is a policy-priority failure.</li>
<li><strong>Other policy gaps:</strong> browser bots may pursue an unaffordable preferred build while passing an affordable alternative. Their Trade Consortium conversion also omits its wildcard Data. The browser and arena bot families are materially different.</li>
<li><strong>Old harness issues:</strong> inconsistent seeds across rotations, mislabeled unfinished runs, and a strategy win-rate denominator based on games instead of player appearances. The replacement study records real stop reasons and normalizes exposures.</li></ul>
<h2>Combat diagnostics</h2>
{table(['Matchup','Attacker takes hex','Mutual destruction','Defender survives / holds'],combat_rows)}
<p>Each row contains 36 enumerated pairings. These are <strong>cases, not outcome probabilities</strong>: players choose tactics and some sequences share an early prefix before combat ends. There are no regular-card reactions or Shipyards, Explorers stay and fight, and retreat space is available. One Fleet versus one Fleet has 19 mutual destructions, four attacker wins and 13 defensive outcomes. A single defending Settler loses to a Fleet in every pairing; two defending Settlers hold in 18 of 36. These are useful playtest cases for the intended ship roles.</p>
<h2>Recommended next work</h2><ol><li>Repair illegal-move loops, first-Shipyard planning and affordable-action fallbacks. Use policies with comparable competence for another tournament.</li><li>Isolate seat identity, home orientation and deterministic tie ordering before changing map spacing.</li><li>Run a pacing playtest, including a lower victory threshold as an experiment. Test Settler durability and Fleet attrition with human tactical decisions before changing ship stats.</li></ol>
<h2>Reproduction and data</h2>
<p>The native analysis runner matched all 15 reported score, colony, relic, Shipyard and purchase averages of the old VM harness on its 12 current-rule smoke seeds. Observers consume no RNG. The production checkout remained clean.</p>
<pre>node run.cjs --engine /path/to/16.21/checkout --mode browser --seeds 64 --rounds 160 --workers 4 --output browser.jsonl
node run.cjs --engine /path/to/16.21/checkout --mode guarded --seeds 64 --rounds 160 --workers 4 --output guarded.jsonl
node run.cjs --engine /path/to/16.21/checkout --mode guarded --order-control 1 --seeds 32 --rounds 160 --workers 4 --output order-control.jsonl
python3 analyze.py
python3 plot.py</pre>
<p><a href="summary.json">Full statistics</a> · <a href="players.csv">Player results CSV</a> · <a href="browser.jsonl">Baseline raw games</a> · <a href="guarded.jsonl">Safeguarded raw games</a> · <a href="order-control.jsonl">First-player controls</a> · <a href="combat.json">Combat cases</a> · <a href="audit/rust-summary.json">Rust diagnostic</a> · <a href="validation-summary.json">Harness validation</a></p>
<footer><small>Analysis-only artifacts. The published game and its canonical rulebook are unchanged by this study.</small></footer></html>'''
(ROOT/'report.html').write_text(body)
# Keep the small independent audit harness beside its data.
audit=Path('/private/tmp/galactic-balance-audit')
for name in ['src/main.rs','Cargo.toml','Cargo.lock']:
    source=audit/name
    if source.exists():
        target=ROOT/'audit'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
adapter=Path('/private/tmp/drawing-board-compact-frontier/prototypes/galactic-reach/adapter.js')
for meta in ROOT.glob('*.meta.json'):
    obj=json.loads(meta.read_text());obj['sourceCommit']=s['sourceCommit'];obj['adapterSha256']=hashlib.sha256(adapter.read_bytes()).hexdigest()
    if meta.name.startswith('order-control'):obj['setupControl']='Initial first-player marker cycles 0–3 with the same map and decks.'
    meta.write_text(json.dumps(obj,indent=2))
print(ROOT/'report.html')
