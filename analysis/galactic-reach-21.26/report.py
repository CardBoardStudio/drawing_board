from pathlib import Path
import base64, gzip, hashlib, html, json, os, sys
ROOT=Path(__file__).resolve().parent
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'.matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

PARTIAL='--main-only' in sys.argv
s=json.loads((ROOT/('partial-summary.json' if PARTIAL else 'summary.json')).read_text());m=s['mixed'];RES=['matter','energy','biomass','data'];STRATS=['military','economy','expansion']
colors=['#c77dff','#38bdf8','#6ee7b7'];rcolors=['#f5b54b','#59c5e8','#79c883','#ba9bff']
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False})
fig,axs=plt.subplots(1,2,figsize=(11.8,4.5),layout='constrained')
rates=[m['byStrategy'][x]['winShareOfFinished'] for x in STRATS]
means=np.array([r['mean'] for r in rates]);err=np.array([[r['mean']-r['CI95'][0] for r in rates],[r['CI95'][1]-r['mean'] for r in rates]])
axs[0].bar([x.title() for x in STRATS],means,color=colors,yerr=err,capsize=5)
axs[0].set(ylabel='Share of finished mixed-game wins (%)',title='Current browser strategy profiles',ylim=(0,max(45,float(max(means+err[1]))+7)))
for i,v in enumerate(means):axs[0].text(i,v+err[1,i]+1,f'{v:.1f}%',ha='center')
mirror=s['mirrors'];seat=[mirror['bySeat'][str(i)] for i in range(4)]
means=np.array([r['mean'] for r in seat]);err=np.array([[r['mean']-r['CI95'][0] for r in seat],[r['CI95'][1]-r['mean'] for r in seat]])
axs[1].bar(['Seat 1','Seat 2','Seat 3','Seat 4'],means,color='#94a3b8',yerr=err,capsize=5)
axs[1].axhline(25,color='#64748b',linestyle='--',linewidth=1)
axs[1].set(ylabel='Share of finished mirror-game wins (%)',title='Same strategy at all four seats',ylim=(0,max(55,float(max(means+err[1]))+6)))
fig.suptitle(f'Scoring Bots 21.26 · {m["finished"]}/{m["games"]} mixed games finished by round 100',fontsize=14)
fig.supxlabel('95% intervals resample whole map-seed blocks. Unfinished games are excluded from wins, not counted as losses.',fontsize=9)
fig.savefig(ROOT/'strategies.png',dpi=160);plt.close(fig)

fig,axs=plt.subplots(1,2,figsize=(12,4.5),layout='constrained');x=np.arange(4);data=s['resources'];w=.23
created=[data[r]['createdPerProductionRound'] for r in RES]
spent=[data[r]['fixedSpendPerProductionRound']+data[r]['flexibleSpendPerProductionRound'] for r in RES]
discarded=[data[r]['overflowPerProductionRound'] for r in RES]
axs[0].bar(x-w,created,w,label='Created',color='#8fb8d0');axs[0].bar(x,spent,w,label='Spent on actions/cards/upgrades',color='#47ad83');axs[0].bar(x+w,discarded,w,label='Overflow discarded',color='#d8837d')
axs[0].set(xticks=x,xticklabels=[r.title() for r in RES],ylabel='Units per player per observed production round',title='Resource flows');axs[0].legend(fontsize=8)
short=[data[r]['shortageAfterPercentOfFundingAttempts'] for r in RES]
axs[1].bar([r.title() for r in RES],short,color=rcolors)
axs[1].set(ylabel='Funding attempts still short of this resource (%)',title='Shortages after conversions and bank trades',ylim=(0,max(short)*1.2+1))
for i,v in enumerate(short):axs[1].text(i,v+.4,f'{v:.1f}%',ha='center')
fig.suptitle('Resources are measured under the current bots’ decisions',fontsize=14)
fig.supxlabel('Transfers are excluded from creation. Bank offers/requests and flexible spending are detailed in the report.',fontsize=9)
fig.savefig(ROOT/'resources.png',dpi=160);plt.close(fig)
if PARTIAL:
    print('Wrote figures for the completed main suite.');sys.exit(0)

def num(v,n=1):return '—' if v is None else f'{v:,.{n}f}'
def interval(d):return f'{num(d["mean"])} [{num(d["CI95"][0])}, {num(d["CI95"][1])}]'
def table(headers,rows):
    return '<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(x)+'</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(x))+'</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table></div>'
def image(name,alt):return f'<img alt="{html.escape(alt)}" src="data:image/png;base64,{base64.b64encode((ROOT/name).read_bytes()).decode()}">'
base=s['baseline20_25']['mixed'];h=s['headToHead']['all']
body=f'''<h1>Scoring Bots 21.26: strategy and resource balance</h1>
<p>Frozen engine at <code>{s['commit']}</code>. {s['validation']['totalRuns']:,} offline simulations of the updated local-browser policies, plus matched20.25 controls. Worlds are public; each seed generates hidden, randomized moons. Human rules and initial setups match20.25. Policy changes have their own21.26 playtest origin and fresh saves.</p>
<aside><strong>Completion matters.</strong> {m['finished']} of {m['games']} mixed games finished by round 100 ({m['completionPercent']:.1f}%). The other {m['games']-m['finished']} have no recorded winner. Conditional win percentages describe finished bot games, not all possible games or optimal human play.</aside>
<p><strong>Strength test:</strong> New bots won {h['newWins']}/{h['finished']} completed head-to-head games ({h['newWinShareOfFinished']['mean']:.1f}%;95% seed-block interval {h['newWinShareOfFinished']['CI95'][0]:.1f}–{h['newWinShareOfFinished']['CI95'][1]:.1f}%). Each game has two old and two new bots with the same strategy profile; generation assignment rotates through seats.</p>
<p><strong>Scoring pace:</strong> All-new mixed games finished {m['finished']}/{m['games']} by round100, versus {base['finished']}/{base['games']} for the old policies. The median among finished games changed from {num(base['medianFinishRound'],0)} to {num(m['medianFinishRound'],0)} rounds. Completion and matched finish-time effects are shown separately below.</p>
<h2>Strategies</h2><p>Score and Colony averages include all mixed games at their observed endpoints. Win percentages use finished games only.</p>'''
body+=table(['Policy set','Finished / mixed games','Median rounds among finished','Mean combat encounters / game'],[[label,f"{d['finished']}/{d['games']}",num(d['medianFinishRound'],0),num(d['combatsPerGame'],2)] for label,d in [('Old20.25',base),('New21.26',m)]])
body+=f"<p>Paired completion change: {interval(s['baseline20_25']['completionChangePP'])} percentage points. Among {s['baseline20_25']['mutuallyFinished']} mutually finished pairs, finish-round change: {interval(s['baseline20_25']['finishRoundChangeAmongMutuallyFinished'])}. All768 initial states, card setups, maps and RNG positions match after version normalization.</p>"
body+='<h2>Old versus new on the same table</h2>'+table(['Profile','Finished','New wins','Old wins','New win share, % [95% CI]','Mean new points','Mean old points'],[[x.title(),d['finished'],d['newWins'],d['oldWins'],interval(d['newWinShareOfFinished']),num(d['byGeneration']['new']['prestige'],2),num(d['byGeneration']['old']['prestige'],2)] for x,d in s['headToHead']['byStrategy'].items()])
fig,ax=plt.subplots(figsize=(9,4.5),layout='constrained')
hs=[s['headToHead']['byStrategy'][x]['newWinShareOfFinished'] for x in STRATS]
ax.bar([x.title() for x in STRATS],[d['mean'] for d in hs],color=colors,yerr=[[d['mean']-d['CI95'][0] for d in hs],[d['CI95'][1]-d['mean'] for d in hs]],capsize=5)
ax.axhline(50,color='#64748b',linestyle='--');ax.set(ylim=(0,105),ylabel='New bots’ share of completed wins (%)',title='Two new bots versus two old bots · same profile in every seat')
fig.savefig(ROOT/'headtohead.png',dpi=160);plt.close(fig)
body+=image('headtohead.png','New bot win share against the archived old counterpart, by profile')
body+=table(['Strategy','Wins','Share of finished wins, % [95% CI]','Wins per finished appearance, % [95% CI]','Mean Colonies','Mean relics','Mean combat points'],[
    [x.title(),m['byStrategy'][x]['wins'],interval(m['byStrategy'][x]['winShareOfFinished']),interval(m['byStrategy'][x]['winRatePerFinishedAppearance']),num(m['byStrategy'][x]['colonies'],2),num(m['byStrategy'][x]['relics'],2),num(m['byStrategy'][x]['combatPoints'],2)] for x in STRATS])
body+=f'<p>Completed games ended at a median of {num(m["medianFinishRound"],0)} rounds. Winner score components averaged '+', '.join(f'{k}: {v:.2f}' for k,v in m['winnerComponents'].items())+'. Card purchases and Shipyards award no points.</p>'
body+=image('strategies.png','Strategy win rates and mirror-game seat win shares with seed-block confidence intervals')
lh=s['longHorizon'];long=lh['current'];base=lh['matched100']
body+=f'<h2>Long-horizon check</h2><p>The same {long["games"]} mixed setups finished {base["finished"]} games by round 100 and {long["finished"]} by round 300. The remaining {long["games"]-long["finished"]} are still unfinished. Limits are research cutoffs; the real game has no round limit.</p>'
body+=table(['Strategy','Wins by round 100','Wins by round 300','Share of round-300 finished wins, % [95% CI]'],[[x.title(),base['byStrategy'][x]['wins'],long['byStrategy'][x]['wins'],interval(long['byStrategy'][x]['winShareOfFinished'])] for x in STRATS])
body+='<h2>Resources</h2><p>Flows include every mixed game through its observed endpoint. Per-round rates use recorded production rounds. Funding shortages count chosen funding attempts, which can repeat. New bots precheck plans, so these frequencies cannot measure changes in intrinsic resource value or the percentage of blocked turns.</p>'
body+=table(['Resource','Created / round','Fixed spend / round','Flexible spend / round','Overflow / round','Bank wanted / round','Bank offered / round','End stock','Funding attempts still short, %'],[[r.title()]+[num(data[r][k],2) for k in ['createdPerProductionRound','fixedSpendPerProductionRound','flexibleSpendPerProductionRound','overflowPerProductionRound','bankRequestsPerProductionRound','bankOffersPerProductionRound','meanEndStock','shortageAfterPercentOfFundingAttempts']] for r in RES])
body+=image('resources.png','Observed resource creation spending discards and funding shortages')
body+='<h3>Timing changes the bottlenecks</h3>'+table(['Period','Matter shortages / 100 production rounds','Energy','Biomass','Data'],[[label]+[num(s['periodResources'][period][r]['shortageAfterPer100ProductionRounds']) for r in RES] for period,label in [('early','Rounds 1–5'),('middle','Rounds 6–10'),('late','After round 10')]])
body+='<h3>What the bots do with victory paths</h3>'+table(['Profile','Reached an additional Colony','Median first additional Colony round, among those reaching','Mean combat points'],[[x.title(),f'{s["milestones"][x]["firstColony"]["reached"]}/{s["milestones"][x]["firstColony"]["playerGames"]}',num(s['milestones'][x]['firstColony']['medianRoundAmongReaching'],0),num(m['byStrategy'][x]['combatPoints'],2)] for x in STRATS])
body+='<h2>Matched +2-resource bonuses</h2><p>Each resource and timing has 384 matched pairs from 32 seed blocks. The focal profile rotates through all four seats. Win effects below use only pairs in which both games finished; unfinished outcomes remain unknown. The all-pair bounds show how much those unknown winners could change the result. These are policy-dependent marginal tests, not resource exchange rates. Summary JSON also provides family-adjusted confidence intervals.</p>'
for t in ['1','10']:
    rows=[]
    for r in RES:
        g=s['resourceGifts'][t][r]
        rows.append([r.title(),g['mutuallyFinishedPairs'],interval(g['winEffectPPAmongMutuallyFinished']),f'{g["allPairsWinEffectBoundsPP"][0]:.1f} to {g["allPairsWinEffectBoundsPP"][1]:.1f}',interval(g['completionEffectPP']),interval(g['firstYardRoundChange']),interval(g['colonyByRound20EffectPP'])])
    body+=f'<h3>Bonus at round {t}</h3>'+table(['Resource','Both games finished','Win effect, pp [95% CI]','All-pair win-effect bounds, pp','Completion effect, pp [95% CI]','First Shipyard round change [95% CI]','Colony by round 20 effect, pp [95% CI]'],rows)
body+='<h2>Method and interpretation</h2><ul><li>64 independent setup seeds; three duplicated-profile lineups and four seat rotations each. The map, resource tiles, deck order and market are held fixed across rotations within each seed.</li><li>All 64 moon layouts and full setup fingerprints are distinct. The thirteen world positions remain fixed by the actual rules.</li><li>Military, economy and expansion are the game’s current heuristic profiles. They share many build and Explorer priorities. This tests those implementations, not every strategy a human can invent.</li><li>Observers match the plain published engine for finished and censored runs. Resource ledgers, period flows, score components and combat awards reconcile exactly.</li><li>10,000 whole-seed-block bootstrap draws account for related rotations. Mirrors use identical profiles at all seats.</li><li>The20.25 baseline has identical human mechanics. Archived controls and all-old shared-state runs reproduce its trajectories, ledgers and RNG exactly.</li></ul>'
body+='<p>Reproduction: see <code>STUDY.md</code>, <code>README.md</code>, <code>run.cjs</code>, <code>verify.cjs</code> and <code>summary.json</code>. Compressed raw records and SHA256 hashes accompany this report.</p>'
doc='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scoring Bots 21.26 balance study</title><style>body{max-width:1160px;margin:40px auto;padding:0 22px;font:16px/1.6 system-ui;color:#162438;background:#f7f9fc}h1{line-height:1.2}h2{margin-top:36px}aside{padding:18px;background:#fff3d7;border-left:4px solid #d89b1a}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px;background:white}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce4ed;vertical-align:top}th{background:#e7edf5}img{max-width:100%;height:auto;margin:20px 0}code{overflow-wrap:anywhere}p{max-width:100ch}</style></head><body>'''+body+'</body></html>'
(ROOT/'report.html').write_text(doc)

raw=[]
for name in ['main','gifts','long','headtohead']:
    p=ROOT/(name+'.jsonl');content=p.read_bytes() if p.exists() else gzip.decompress((ROOT/(name+'.jsonl.gz')).read_bytes());compressed=gzip.compress(content,mtime=0);(ROOT/(name+'.jsonl.gz')).write_bytes(compressed)
    raw.append({'file':p.name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'compressedFile':p.name+'.gz','compressedSha256':hashlib.sha256(compressed).hexdigest()})
manifest={'rules':s['rules'],'commit':s['commit'],'engineSha256':s['validation']['engineSha256'],'raw':raw,'files':{}}
for p in ROOT.iterdir():
    if p.is_file() and p.name!='manifest.json' and p.suffix not in ['.jsonl','.gz']:manifest['files'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
manifest['sharedHarnessSha256']=hashlib.sha256((ROOT.parent/'galactic-reach-16.21/run.cjs').read_bytes()).hexdigest()
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2));print('Wrote standalone report, plots, compressed raw records and integrity manifest.')
