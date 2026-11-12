from pathlib import Path
from html import escape
import json,os,shutil
ROOT=Path(__file__).resolve().parent
s=json.loads((ROOT/'summary.json').read_text());main=s['main10'];control=s['control20'];matched=s['matched10']
def table(headers,rows):return '<div class="table"><table><thead><tr>'+''.join('<th>'+escape(str(x))+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+escape(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
profiles=[]
for name in ['expansion','economy','military']:
 d=main['byStrategy'][name];lo,hi=d['winShareCI95'];profiles.append([name.title(),d['wins'],f"{d['winShare']:.1f}%",f'{lo:.1f}–{hi:.1f}%',f"{d['colonies']:.2f}",f"{d['relics']:.2f}",f"{d['yards']:.2f}"])
flows=[];gifts=[]
for resource in ['matter','energy','biomass','data']:
 d=s['resources'][resource];flows.append([resource.title()]+[f'{d[k]:.1f}' for k in ['generatedPerPlayerGame','fixedSpendPerPlayerGame','flexibleSpendPerPlayerGame','overflowPerPlayerGame','meanEndStock','shortageAfterPerPlayer']])
 for round_ in ['1','10']:
  d=s['gifts'][round_][resource];lo,hi=d['CI95'];gifts.append([resource.title(),round_,f"{d['effectPP']:+.1f}",f'{lo:+.1f} to {hi:+.1f}',f"{d['meanFirstYardRoundChange']:+.2f}"])
score=main['winnerScore'];delta=s['pairedTargetEffect']['strategyWinShareChangePP']
body=f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ten-Prestige balance and resource study</title>
<style>body{{font:16px/1.6 system-ui,sans-serif;color:#243247;max-width:1050px;padding:24px;margin:auto;background:#fff}}h1,h2{{line-height:1.2;color:#122333}}h1{{font-size:34px}}h2{{margin-top:40px;font-size:24px}}p,li{{max-width:90ch}}.note{{padding:16px 20px;background:#edf4fa;border-left:4px solid #597fbe}}.table{{overflow:auto}}table{{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}}th,td{{padding:9px 12px;text-align:left;border-bottom:1px solid #dbe3ec}}th{{background:#f0f4f8}}small{{color:#526176}}img{{max-width:100%;height:auto}}code,pre{{background:#f1f4f7;padding:3px 5px;overflow:auto}}a{{color:#185ab4}}footer{{margin-top:48px;border-top:1px solid #dbe3ec;padding-top:16px}}</style>
<h1>Ten-Prestige playtest: strategies and resources</h1>
<p><small>Local experiment 17.22 · Implementation {s['implementationCommit']}</small></p>
<p class="note"><strong>Assessment:</strong> lowering victory to10 Prestige makes the race much shorter, while expansion remains the strongest existing browser bot profile. Resource usefulness changes with timing: Data is the main opening shortage but is overproduced later; Biomass often accumulates. The matched resource bonuses do not produce a statistically clear overall value ranking.</p>
<h2>What changed</h2>
<p>The local game now ends at10 Prestige after round cleanup. It includes the tested inward first Shipyard, home-relative AI search ordering, affordable-build fallback after a usable Shipyard, and legal-move guards. Resource costs, production and scoring sources are unchanged. Previous16.21 games and policies remain archived. This experiment is prepared locally; it has not been published to Render.</p>
<h2>What was run</h2><ul>
<li>86410-point games:768mixed-profile games across64map seeds and96identical-profile games.</li>
<li>43220-point control games with the same corrected bots:384mixed games plus48identical-profile games. Their seeds match the first32main seed blocks.</li>
<li>1,728resource experiments:192matched focal-player setups × a baseline and eight+2resource bonuses (four resources at round1 or10). The focal profile is duplicated and rotates through all four homes.</li>
<li>All3,024runs finished. Every per-resource ledger closed exactly; all192gift baselines reproduced their corresponding main games, including score and resource flow.</li></ul>
<p>Mixed games rotate each of three possible duplicated profiles through all four seats. Each profile appears in1,024player-seats in the main10-point batch. Equal-strength references are33.3% of wins per profile and25% wins per individual appearance. Confidence intervals resample whole map-seed blocks. These profiles are existing heuristics, not optimal human strategies.</p>
<h2>Strategy comparison at10 Prestige</h2>
{table(['Bot profile','Wins /768','Share of wins','95% interval','Mean colonies','Mean relics','Mean Shipyards'],profiles)}
<p>The expansion bot averages3.11Colonies, compared with1.10for military. All three recover roughly three relics per player. Military's poor result therefore includes its difficulty turning ships into conquest/Colony score; it is not a clean test of optimal military play or Fleet combat strength.</p>
<img src="strategies.png" alt="Ten-point bot win shares and matched ten-versus-twenty-point game lengths.">
<h2>Effect of lowering the target</h2>
<p>Median mixed-game length falls from<strong>{control['medianRound']:g} rounds</strong> at20points to<strong>{main['medianRound']:g}</strong> at10. The10th–90th percentile range at10 is{main['p10Round']:g}–{main['p90Round']:g}rounds. Identical-profile10-point games have a median of23rounds. Automated rounds cannot be converted directly into human session minutes.</p>
<p>On the384matched mixed games, military's share of wins changes by{delta['military']['effect']:+.1f}percentage points (95% interval{delta['military']['CI95'][0]:+.1f} to{delta['military']['CI95'][1]:+.1f}); economy changes by{delta['economy']['effect']:+.1f}, and expansion by{delta['expansion']['effect']:+.1f}. Thus the shorter target shifts victories from this military profile to economy while expansion remains dominant.</p>
{table(['Average winning score source','Prestige'],[['Colonies + frontier pairs',f"{score['colonies']+score['frontierPrestige']:.2f}"],['Excavations',f"{score['relics']:.2f}"],['Purchased cards',f"{score['deckPrestige']:.2f}"],['Shipyard pairs',f"{score['yardPrestige']:.2f}"]])}
<p>Relics contribute about39% of the average winning score, Colonies/frontier pairs42%, purchases17%, and Shipyard pairs2%. Those are pooled winning-score components, not independent causal values.</p>
<h2>Resource flow</h2>
<p>Values below are mean units per player per game in the768main mixed games. Generated units include production and card gains; fixed spending includes structures, ships, Colonies, excavation, purchases, storage and escape. Flexible spending is starter upgrades and trashing, which accept a chosen resource. Bank/player trades are accounted separately. Shortages count selected Operations costs still unaffordable after the bot's conversions/bank planning.</p>
{table(['Resource','Generated','Fixed spending','Flexible spending','Overflow discarded','Ending stock','Unfunded order checks'],flows)}
<ul><li><strong>Matter/Energy:</strong> most supply is spent or converted, with relatively low ending stocks. Energy is the resource most frequently offered to the bank.</li>
<li><strong>Data:</strong>3.82unfunded selected-order checks per player versus0.34–0.89for other resources. A starting+2Data bonus advances the first Shipyard by1.71rounds on average. Yet the bots generate85.5Data per player, discard12.9to overflow and finish with15.6. Their preference for Data Harvesters contributes to this opening-shortage/later-surplus pattern.</li>
<li><strong>Biomass:</strong>17.4units go to fixed costs out of34.9generated, with10.1left over on average. It is less broadly spent in these runs, but that alone does not establish low marginal value: expansion still needs it for Colonies.</li></ul>
<h2>Matched resource bonuses</h2>
<p>Each case adds exactly two units of one resource to the same focal player, compared with the same seed, lineup and seat without the bonus. The gift occurs after production overflow clears and before an ordinary action. All192gifts in every condition were applied. Changes in win rate are percentage points:</p>
{table(['Resource','Gift round','Focal win-rate change','95% paired interval','First-yard round change'],gifts)}
<p><strong>Every overall bonus interval includes zero.</strong> The current sample cannot reliably rank the four resources by their effect on winning. This is not evidence of equal intrinsic value. Bonuses can change a heuristic bot's choices, and extra stock can be discarded or fail to address its actual bottleneck. Strategy-specific estimates use64pairs each and are less precise; for example, starting Data helps the expansion profile's observed win rate but not the military profile's.</p>
<img src="resources.png" alt="Resource spending, surplus and paired bonus estimates with uncertainty intervals.">
<h2>What to test next</h2><ol><li>Keep10Prestige as a pacing playtest and check that a deliberate conquest policy can compete with expansion before changing Fleet stats.</li><li>Make bot production priorities respond to shortages and inventories, particularly excess Data Harvesters, before interpreting their stockpiles as proof of a cost imbalance.</li><li>Use targeted follow-ups for Biomass demand and Data's opening gate. Any cost change should be tested as its own experiment.</li></ol>
<h2>Local implementation and verification</h2>
<p><a href="http://127.0.0.1:8867/galactic-reach/">Local10-point game</a> · <a href="http://127.0.0.1:8867/galactic-reach/rulebook.html#victory">Canonical local victory rules</a>. The in-app browser verified17.22, the10-point header/dialog/manual and331hexes. All Node/map/dialog/replay/rules checks,61Rust tests, formatting, Clippy, Wasm/package checks and full native HTTP smoke passed. Docker was unavailable; no container-image validation is claimed.</p>
<p>The engine's20-point parity check reproduced12prior corrected-policy game outcomes. An observed/unobserved10-point pilot produced identical results. Resource observers consume no RNG and assert every ledger against final stocks. The source engine hash is recorded in each batch metadata file.</p>
<h2>Files and reproduction</h2>
<pre>node run.cjs --suite main --seeds 64 --target 10 --workers 4 --output main10.jsonl
node run.cjs --suite main --seeds 32 --target 20 --workers 4 --output control20.jsonl
node run.cjs --suite gifts --seeds 16 --target 10 --workers 4 --output gifts.jsonl
python3 analyze.py
python3 report.py</pre>
<p><a href="summary.json">Full statistics and intervals</a> · <a href="resources.csv">Resource flow CSV</a> · <a href="main10.jsonl">10-point games</a> · <a href="control20.jsonl">20-point controls</a> · <a href="gifts.jsonl">Paired resource experiments</a> · <a href="implementation-verification.json">Local verification record</a></p>
<footer><small>Local research experiment. Findings describe these bot policies and matched interventions; human-play balance remains a separate question.</small></footer></html>'''
# Normalize numeric phrases in prose, preserving source hashes and command blocks.
import re
body=body.replace(s['implementationCommit'],'IMPLEMENTATIONCOMMITTOKEN')
parts=re.split(r'(<[^>]*>)',body);in_code=False
for i,part in enumerate(parts):
    if part.startswith('<'):
        if re.match(r'<(?:pre|code)\b',part):in_code=True
        elif re.match(r'</(?:pre|code)>',part):in_code=False
    elif not in_code:
        part=re.sub(r'(?<=[A-Za-z])(?=[+-]?\d)',' ',part)
        part=re.sub(r'(?<=\d)(?=[A-Za-z])',' ',part)
        part=re.sub(r'(?<=%)(?=[A-Za-z])',' ',part)
        part=re.sub(r'(?<=\d) (st|nd|rd|th)\b',r'\1',part)
        parts[i]=part
body=''.join(parts).replace('IMPLEMENTATIONCOMMITTOKEN',s['implementationCommit'])
(ROOT/'report.html').write_text(body)
source=Path('/private/tmp/ten-prestige-verification.json')
if source.exists():shutil.copy2(source,ROOT/'implementation-verification.json')
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'.matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig,axes=plt.subplots(1,2,figsize=(11,4.65));fig.subplots_adjust(left=.09,right=.985,bottom=.23,top=.79,wspace=.3)
fig.suptitle('Ten Prestige shortens the race; expansion still leads',x=.02,y=.98,ha='left',fontsize=15,fontweight='bold')
keys=['expansion','economy','military'];ys=[main['byStrategy'][k]['winShare'] for k in keys];ci=[main['byStrategy'][k]['winShareCI95'] for k in keys]
ax=axes[0];ax.barh([k.title() for k in keys],ys,color=['#358b6d','#597fbe','#c87a40']);ax.errorbar(ys,range(3),xerr=[[y-b[0] for y,b in zip(ys,ci)],[b[1]-y for y,b in zip(ys,ci)]],fmt='none',capsize=4,color='#253143')
for i,y in enumerate(ys):ax.text(ci[i][1]+2,i,f'{y:.1f}%',va='center',fontsize=11)
ax.axvline(100/3,color='#66727d',linestyle='--');ax.invert_yaxis();ax.set_xlim(0,85);ax.set_xlabel('Share of wins (%)');ax.set_title('10-point main tournament',loc='left',fontsize=12)
all10=[json.loads(x) for x in (ROOT/'main10.jsonl').read_text().splitlines()];all20=[json.loads(x) for x in (ROOT/'control20.jsonl').read_text().splitlines()]
ten=[r['round'] for r in all10 if r['design']=='mixed' and r['block']<2032];twenty=[r['round'] for r in all20 if r['design']=='mixed']
axes[1].hist([ten,twenty],bins=range(10,116,5),label=['10 Prestige','20 Prestige'],color=['#358b6d','#597fbe'],alpha=.8)
axes[1].set_xlabel('Round when game ended');axes[1].set_ylabel('Games');axes[1].set_title('Matched maps and corrected bots',loc='left',fontsize=12);axes[1].legend(frameon=False)
for ax in axes:ax.spines[['top','right']].set_visible(False)
fig.text(.02,.08,'Strategy: 768 games / 64 seed blocks. Pacing: 384 matched games per target / 32 seed blocks.',fontsize=9,color='#4a5565')
fig.text(.02,.03,'Bot-profile results, not optimal human strategies. Error bars: 95% seed-block bootstrap intervals.',fontsize=9,color='#4a5565')
fig.savefig(ROOT/'strategies.png',dpi=160,facecolor='white');fig.savefig(ROOT/'strategies.svg',facecolor='white')
fig,axes=plt.subplots(1,2,figsize=(11,4.65));fig.subplots_adjust(left=.075,right=.98,bottom=.23,top=.78,wspace=.35)
fig.suptitle('Resources: opening shortages and later surplus',x=.02,y=.98,ha='left',fontsize=15,fontweight='bold')
names=['Matter','Energy','Biomass','Data'];keys=[k.lower() for k in names];ax=axes[0]
for offset,key,label,color in [(-.25,'fixedSpendPerPlayerGame','Fixed-cost spending','#358b6d'),(0,'meanEndStock','Ending stock','#597fbe'),(.25,'overflowPerPlayerGame','Overflow discarded','#c87a40')]:ax.bar([i+offset for i in range(4)],[s['resources'][r][key] for r in keys],width=.24,label=label,color=color)
ax.set_ylim(0,64);ax.set_xticks(range(4),names);ax.set_ylabel('Units per player per game');ax.set_title('Actual resource flow',loc='left',fontsize=12);ax.legend(frameon=False,fontsize=8)
ax=axes[1]
for phase,offset,label,color in [('1',-.12,'+2 at game start','#597fbe'),('10',.12,'+2 at round 10','#c87a40')]:
 ds=[s['gifts'][phase][r] for r in keys];values=[d['effectPP'] for d in ds];cis=[d['CI95'] for d in ds]
 ax.errorbar(values,[i+offset for i in range(4)],xerr=[[v-b[0] for v,b in zip(values,cis)],[b[1]-v for v,b in zip(values,cis)]],fmt='o',capsize=3,label=label,color=color)
ax.set_yticks(range(4),names);ax.invert_yaxis();ax.axvline(0,color='#66727d',linestyle='--');ax.set_xlabel('Focal win-rate change (percentage points)');ax.set_title('Matched resource bonuses',loc='left',fontsize=12);ax.legend(frameon=False,fontsize=8)
for ax in axes:ax.spines[['top','right']].set_visible(False)
fig.text(.02,.08,'Bonus estimates: 192 paired games per condition / 16 seed blocks. All 95% intervals include zero.',fontsize=9,color='#4a5565')
fig.text(.02,.03,'Gross spending and stockpiles are not intrinsic prices; estimates depend on bot choices, timing and capacity.',fontsize=9,color='#4a5565')
fig.savefig(ROOT/'resources.png',dpi=160,facecolor='white');fig.savefig(ROOT/'resources.svg',facecolor='white')
print(ROOT/'report.html')
