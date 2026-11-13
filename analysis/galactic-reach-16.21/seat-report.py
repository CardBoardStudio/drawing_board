from pathlib import Path
import json,shutil,os
from html import escape
ROOT=Path(__file__).resolve().parent
s=json.loads((ROOT/'seat-cause.json').read_text());c=s['confirmation']
labels={'baseline':'Original bot choices','inward-yard':'Inward first Shipyard','relative-paths':'Home-relative pathfinding','affordable-build':'Affordable-build preference','inward-relative-paths':'Inward Shipyard + relative paths','inward-affordable':'Inward Shipyard + affordable builds','relative-affordable':'Relative paths + affordable builds','all-policy':'All three bot changes'}
def table(headers,rows):
    return '<div class="table"><table><thead><tr>'+''.join('<th>'+escape(str(x))+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
rows=[[labels[k]]+[f"{v['homeWinShares'][str(i)]:.1f}%" for i in range(4)] for k,v in c.items()]
screen=s['screen'];old=screen['baseline'];owners=[screen['owner-rotation:'+str(i)] for i in [1,2,3]]
owner_homes=[old['winsByHome'][str(i)]+sum(v['winsByHome'][str(i)] for v in owners) for i in range(4)]
owner_ids=[old['winsByPlayer'].get(str(i),0)+sum(v['winsByPlayer'].get(str(i),0) for v in owners) for i in range(4)]
paired=s['pairedVersusBaseline']['inward-relative-paths'];lo,hi=paired['CI95']
body=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galactic Reach: cause of the seat effect</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;color:#243247;max-width:1000px;padding:24px;margin:auto;background:#fff}}h1,h2{{line-height:1.2;color:#122333}}h1{{font-size:34px}}h2{{margin-top:36px;font-size:23px}}p,li{{max-width:87ch}}.note{{padding:16px 20px;background:#edf4fa;border-left:4px solid #597fbe}}.table{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}}th,td{{padding:9px 12px;text-align:left;border-bottom:1px solid #dbe3ec}}th{{background:#f0f4f8}}small{{color:#526176}}img{{max-width:100%;height:auto}}code,pre{{background:#f1f4f7;padding:3px 5px;overflow:auto}}a{{color:#185ab4}}footer{{margin-top:40px;border-top:1px solid #dbe3ec;padding-top:16px}}</style>
<h1>What causes the measured seat effect?</h1>
<p><small>Follow-up to the Galactic Reach 16.21 balance study · Source commit {s['sourceCommit']}</small></p>
<p class="note"><strong>The evidence identifies bot orientation as a major cause.</strong> The first-Shipyard tie always selects global East; equal-distance pathfinding also uses a global directional order. Those choices interact with fixed home resource orientations and launch positions. Swapping identities and starting decks does not remove the weak home. Making the opening Shipyard and pathfinding home-relative substantially changes the seat distribution.</p>
<h2>Direct source mechanisms</h2><ol>
<li><strong>Every first Shipyard is East.</strong> The builder assembles equally scored first-Shipyard candidates in world insertion order, then uses a stable score sort. The first neighbor is East. It never evaluates inward launch quality for that tie.</li>
<li><strong>East produces different resources at different homes.</strong> Home generation swaps Energy into each home's inward hex. The East first Shipyard therefore produces Energy, Data, Matter and Data for homes 1–4. Home 3's East launch is also on the outer rim. On a validated symmetric map, East launches are 4, 4, 6 and 6 steps from the nearest neutral center; inward launches are all 4.</li>
<li><strong>Path ties have a compass preference.</strong> The nearest-goal and path BFS functions visit East, northeast, north, west, southwest and south in that fixed order. Reflected equal-distance goal fixtures select different relative goals at different homes. The intervention changes only those two AI searches to use each home's reflected neighbor order; legal movement and the map are unchanged.</li>
<li><strong>Affordability can amplify resource differences.</strong> The bot may choose an unaffordable Explorer even when another ship is affordable. Direct production fixtures show how the different yard yields create that situation. Whole-game tests below keep this separate; repairing this preference alone does not neutralize seats.</li></ol>
<h2>Matched whole-game confirmation</h2>
<p>Eight combinations of three AI interventions were run on <strong>32 fresh map seeds</strong>, with all three homogeneous bot profiles. Each row has <strong>96 completed games</strong>. Every row shares the same map/deck seed set and normal starting actor. All variants retain the same legal-move safeguard used in the initial study.</p>
{table(['Bot intervention','Home 1 wins','Home 2 wins','Home 3 wins','Home 4 wins'],rows)}
<p>For the previously weak home 3, inward launch plus home-relative paths changes win share by <strong>{paired['weakHomeWinShareChangePP']:+.1f} percentage points</strong> against the matched baseline; its paired 95% seed-block bootstrap interval is {lo:+.1f} to {hi:+.1f} points. Interactions matter: the effects are not additive, and individual fixes can move the advantage to another home.</p>
<img src="seat-cause.png" alt="Home win shares before and after the two orientation changes, with 95 percent seed-block intervals.">
<h2>Identity and deck controls</h2>
<p>The initial screen used 16 map seeds and three bot profiles. Including the baseline and three ownership rotations gives 192 matched games. Physical-home win counts were {owner_homes}; player-identity win counts were {owner_ids}. Player identity 3 does not remain the weak identity when assigned elsewhere, while physical home 3 remains the weakest home.</p>
<p>Rotating the shuffled starter decks between identities leaves home 3 with {sum(screen['deck-rotation:'+str(i)]['winsByHome']['2'] for i in [1,2,3])} wins out of 144. Giving everyone the same initial starter key order leaves it with {screen['equal-starters']['winsByHome']['2']} wins out of 48. Thus starting-deck allocation does not explain away the pattern. The separate earlier 384-game first-actor control also showed that simply starting first was not the explanation.</p>
<h2>Scope of the conclusion</h2>
<p>These interventions establish causes of the measured <strong>bot seat effect</strong>. They do not establish perfect human balance or prove that every remaining positional difference has been removed. Human players can already choose an inward Shipyard; the original simulation bots systematically ignore that option. The randomized inner-world layouts are held fixed within every comparison.</p>
<p>The targeted correction is to evaluate opening launch placement and resolve route/goal ties relative to the player's home, then validate the repaired policy across strategies and human play. A live gameplay change has not been made in this diagnostic task.</p>
<h2>Validation and reproduction</h2><ul>
<li>1,728 valid additional games: 432 setup controls, 528 policy-screen cases, and 768 independent factorial-confirmation games. Every retained game finished.</li>
<li>All 48 baseline screen games exactly reproduce previous winners, finish rounds and score components.</li>
<li>Every forced first-Shipyard placement asserts that the actual built coordinate equals the requested coordinate. Every first yard actually built in inward variants is on Energy. Four of the 3,072 player appearances in the confirmation never built a yard and remain included in the outcome analysis.</li>
<li>Ownership/founder remapping and starter-deck swaps occur before initial production or drawing. No observer consumes RNG.</li>
<li>The first screen contained 288 forced-placement rows with an inactive callback; those rows are explicitly excluded. Valid policy results are in the separately verified follow-up file.</li>
<li>Confidence intervals resample whole map seeds; paired comparisons preserve matching policy profiles and seeds.</li></ul>
<pre>node seat-study.cjs --seeds 16 --suite screen --output seat-screen.jsonl
node seat-study.cjs --seeds 16 --suite followup --output seat-followup.jsonl
node seat-study.cjs --seeds 32 --offset 1000 --suite factorial --output seat-factorial.jsonl
python3 seat-analyze.py
python3 seat-report.py</pre>
<p><a href="seat-cause.json">Full statistics and intervals</a> · <a href="seat-setup-controls.jsonl">Setup controls</a> · <a href="seat-followup.jsonl">Validated policy screen</a> · <a href="seat-factorial.jsonl">Fresh-seed confirmation</a> · <a href="seat-audit/mechanical-findings.txt">Mechanical findings</a> · <a href="seat-audit/mechanical-probes.json">Mechanical fixtures</a> · <a href="report.html">Initial balance study</a></p>
<footer><small>Analysis-only counterfactual policies. The published game and canonical rulebook remain at the reviewed source commit.</small></footer></html>'''
(ROOT/'seat-cause.html').write_text(body)
dest=ROOT/'seat-audit';dest.mkdir(exist_ok=True)
for name in ['mechanical-findings.txt','mechanical-probes.cjs','mechanical-probes.json']:
    source=Path('/private/tmp/galactic-seat-audit')/name
    if source.exists():shutil.copy2(source,dest/name)
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'.matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig,axes=plt.subplots(1,2,figsize=(10,4.5),sharey=True)
fig.subplots_adjust(left=.07,right=.985,bottom=.22,top=.77,wspace=.17)
fig.suptitle('Seat advantage follows bot orientation',x=.04,y=.98,ha='left',fontsize=16,fontweight='bold')
for ax,name in zip(axes,['baseline','all-policy']):
    v=c[name];ys=[v['homeWinShares'][str(i)] for i in range(4)];ci=[v['homeCI95'][str(i)] for i in range(4)]
    ax.bar(range(4),ys,color=['#597fbe','#597fbe','#c87a40','#597fbe'],width=.62)
    ax.errorbar(range(4),ys,yerr=[[y-b[0] for y,b in zip(ys,ci)],[b[1]-y for y,b in zip(ys,ci)]],fmt='none',capsize=4,color='#233347')
    for i,y in enumerate(ys):ax.text(i,ci[i][1]+1,f'{y:.1f}%',ha='center',fontsize=10)
    ax.axhline(25,linestyle='--',color='#66727d',linewidth=1)
    ax.set_title('Original bot choices' if name=='baseline' else 'Home-aware choices + affordable builds',fontsize=11)
    ax.set_xticks(range(4),[f'Home {i+1}' for i in range(4)]);ax.set_ylim(0,65)
    ax.spines[['top','right']].set_visible(False)
axes[0].set_ylabel('Share of wins (%)')
fig.text(.04,.09,'96 completed games per condition · 32 fresh map seeds · three identical-bot profiles',fontsize=9,color='#4a5565')
fig.text(.04,.035,'Dashed line: equal 25% share. Error bars: 95% seed-block bootstrap intervals. Analysis-only policy changes.',fontsize=9,color='#4a5565')
fig.savefig(ROOT/'seat-cause.png',dpi=160,facecolor='white')
fig.savefig(ROOT/'seat-cause.svg',facecolor='white')
print(ROOT/'seat-cause.html')
