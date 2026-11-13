from pathlib import Path
import base64,gzip,hashlib,html,json,os
os.environ.setdefault('MPLCONFIGDIR','/private/tmp/twenty-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

ROOT=Path(__file__).resolve().parent
s=json.loads((ROOT/'summary.json').read_text())
STRATS=['military','economy','expansion'];RES=['matter','energy','biomass','data']
colors=['#bc6142','#7855aa','#b18b20'];resource_colors=['#b9a2ef','#e7b43c','#74a96c','#4d9fc5']
def fmt(v,n=1):return '—' if v is None else f'{v:.{n}f}'
def interval(v):return f'{fmt(v["mean"])} [{fmt(v["CI95"][0])}, {fmt(v["CI95"][1])}]'
def table(headers,rows):
 return '<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(str(c))+'</th>' for c in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>'
def image(name,alt):return f'<img alt="{html.escape(alt)}" src="data:image/png;base64,{base64.b64encode((ROOT/name).read_bytes()).decode()}">'
plt.rcParams.update({'font.size':11,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,2,figsize=(12,4.7),layout='constrained')
x=np.arange(3)
for i,(name,label,color) in enumerate([('baseline','Old rules + old bots','#b7c0ce'),('old-policy','New rules + old bots','#7794ae'),('main','New rules + new bots','#3a9093')]):
 data=s['mixed'] if name=='main' else s[name]['mixed'];v=[data['byStrategy'][k]['winRatePerFinishedAppearance'] for k in STRATS]
 y=np.array([a['mean'] for a in v]);err=np.array([[a['mean']-a['CI95'][0] for a in v],[a['CI95'][1]-a['mean'] for a in v]])
 axes[0].bar(x+(i-1)*.25,y,.23,color=color,label=label,yerr=err,capsize=2)
axes[0].axhline(25,color='#555',ls='--',lw=1);axes[0].set(xticks=x,xticklabels=[k.title() for k in STRATS],ylabel='Wins / completed player appearances (%)',title='Strategy performance');axes[0].legend(fontsize=8)
v=[s['headToHead']['byStrategy'][k]['newWinShareOfFinished'] for k in STRATS];y=np.array([a['mean'] for a in v]);err=np.array([[a['mean']-a['CI95'][0] for a in v],[a['CI95'][1]-a['mean'] for a in v]])
axes[1].bar(x,y,color=colors,yerr=err,capsize=4);axes[1].axhline(50,color='#555',ls='--',lw=1);axes[1].set(xticks=x,xticklabels=[k.title() for k in STRATS],ylim=(0,100),ylabel='New bots’ share of finished wins (%)',title='Two new vs two old, same new rules')
fig.savefig(ROOT/'strategies.png',dpi=160);plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(12,4.7),layout='constrained')
for ax,t in zip(axes,['1','10']):
 values=[s['resourceGifts'][t][r]['winEffectPPAmongMutuallyFinished'] for r in RES];y=np.array([v['mean'] for v in values]);err=np.array([[v['mean']-v['CI95'][0] for v in values],[v['CI95'][1]-v['mean'] for v in values]])
 ax.bar(np.arange(4),y,color=resource_colors,yerr=err,capsize=4);ax.axhline(0,color='#555',lw=1);ax.set(xticks=np.arange(4),xticklabels=[r.title() for r in RES],title=f'+2 resources in round {t}',ylabel='Change in focal win probability (pp)')
fig.savefig(ROOT/'resource-gifts.png',dpi=160);plt.close(fig)
m=s['mixed'];h=s['headToHead']['all'];data=s['resources']
body='<h1>Twenty Point Strategy · 23.28</h1><p>Scoring, escalating storage and rivals updated from the human game report.</p>'
body+=f'<aside><strong>{s["validation"]["totalRuns"]:,} trials.</strong> Main mixed games completed {m["finished"]}/{m["games"]}; median finish round {fmt(m["medianFinishRound"],0)}. Two new bots earned {interval(h["newWinShareOfFinished"])}% of finished head-to-head wins against two old bots on the same new rules. Head-to-head unfinished games: {h["games"]-h["finished"]}.</aside>'
body+='<h2>What changed</h2><p>20 points to win. Each Colony scores 3, each excavated relic 2, each qualifying decisive combat victory 1. No Colony pair bonus, card points or shipyard points. Paid +5 storage upgrades cost 1 of each resource, then 2 each, 3 each, and so on; free relic capacity does not raise the paid tier.</p><p>New bot decisions use public ship positions to avoid exposed Settlers, gather Fleets, escort threatened Settlers and move away from stronger nearby forces. They also invest in missing Data production and upgrade starter cards earlier. Enemy hands and hidden relic locations are unavailable.</p>'
body+='<h2>Strategy comparison</h2>'+table(['Condition','Completed / mixed games','Median finish round','Military win share %','Economy %','Expansion %'],[[label,f'{v["finished"]}/{v["games"]}',fmt(v['medianFinishRound'],0)]+[interval(v['byStrategy'][k]['winShareOfFinished']) for k in STRATS] for label,v in [('22.27 old rules / old bots',s['baseline']['mixed']),('23.28 new rules / old bots',s['old-policy']['mixed']),('23.28 new rules / new bots',m)]])
body+='<p>Each profile appears equally often overall. The control changes the scoring and storage bundle together; it does not identify the separate effect of each rule. The new-bot condition then isolates the decision-policy change under the new rules. Equal bot win rates would not establish human balance.</p>'+image('strategies.png','Matched strategy performance and old/new head-to-head results')
body+=table(['Profile','Wins / appearances in finished mixed games','Final mean Colonies','Final mean excavated relics','Final mean combat points','New-bot head-to-head win share %'],[[k.title(),f'{m["byStrategy"][k]["wins"]}/{m["byStrategy"][k]["finishedAppearances"]}',fmt(m['byStrategy'][k]['colonies'],2),fmt(m['byStrategy'][k]['relics'],2),fmt(m['byStrategy'][k]['combatPoints'],2),interval(s['headToHead']['byStrategy'][k]['newWinShareOfFinished'])] for k in STRATS])
body+='<p>Winner point components averaged '+', '.join(f'{k}: {fmt(v,2)}' for k,v in m['winnerComponents'].items())+'. Relics and Colonies in the previous table are raw counts; these components are weighted points.</p>'
body+='<h2>Resources</h2><p>Production-normalized flows cover each observed player-round, including cutoff games. Fixed spending covers structures, ships, Colonies, excavation, purchases and paid storage. Flexible spending covers starter upgrades and card trashing. Funding-attempt shortages depend on what bots choose to attempt and are not intrinsic resource prices.</p>'
body+=table(['Resource','Created / round','Fixed spent / round','Flexible spent / round','Overflow / round','Bank wanted / round','Bank offered / round','Mean end stock'],[[r.title()]+[fmt(data[r][k],2) for k in ['createdPerProductionRound','fixedSpendPerProductionRound','flexibleSpendPerProductionRound','overflowPerProductionRound','bankRequestsPerProductionRound','bankOffersPerProductionRound','meanEndStock']] for r in RES])
body+='<h2>Controlled resource bonuses</h2><p>Each resource/timing has 384 matched pairs across 32 seed blocks, with the focal profile rotated through all seats. Bars show ordinary 95% intervals. The table also shows intervals adjusted for the eight resource/timing contrasts. Unknown winners remain unknown; all-pair bounds include every censored outcome. These are effects of giving resources to these policies, not exchange rates.</p>'+image('resource-gifts.png','Effects of early and late resource gifts on winning')
for t in ['1','10']:
 body+=f'<h3>Round {t}</h3>'+table(['Resource','Mutually finished pairs','Win effect pp [95% CI]','Family-adjusted 95% interval','All-pair bounds pp'],[[r.title(),s['resourceGifts'][t][r]['mutuallyFinishedPairs'],interval(s['resourceGifts'][t][r]['winEffectPPAmongMutuallyFinished']), ' to '.join(fmt(v) for v in s['resourceGifts'][t][r]['winEffectPPAmongMutuallyFinished']['familyCI95']),' to '.join(fmt(v) for v in s['resourceGifts'][t][r]['allPairsWinEffectBoundsPP'])] for r in RES])
long=s['longHorizon'];body+=f'<h2>Completion and seat checks</h2><p>Of {long["current"]["games"]} matched long-horizon games, {long["matched100"]["finished"]} finished by round 100 and {long["current"]["finished"]} by round 300. Research cutoffs do not change the game’s rules. Identical-profile mirror games finished {s["mirrors"]["finished"]}/{s["mirrors"]["games"]}.</p>'
body+=table(['Seat','Mirror win share % [95% CI]'],[[int(k)+1,interval(v)] for k,v in s['mirrors']['bySeat'].items()])
body+='<h2>Validation and limits</h2><ul>'+''.join('<li>'+html.escape(n)+'</li>' for n in s['notes'])+'</ul><p>All score components, combat awards, resource ledgers, period flows and matched setups reconcile. Verification checks observers against the plain engine, all-old shared-rules control parity, private information, and unique card IDs across old/new actors. Source, freeze manifest, runner metadata, compressed raw records, summary JSON and SHA256 hashes accompany this standalone report.</p>'
style='body{max-width:1120px;margin:36px auto;padding:0 22px;font:16px/1.55 system-ui;color:#18283b;background:#f7f9fc}h1{line-height:1.2}h2{margin-top:34px}aside{padding:20px;background:#e3f1ef;border-left:4px solid #3a9093}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;background:#fff;font-size:14px}th,td{padding:10px;text-align:left;border-bottom:1px solid #dce4ed;vertical-align:top}th{background:#e8edf4}img{max-width:100%;height:auto;margin:20px 0}p{max-width:100ch}'
(ROOT/'report.html').write_text(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Twenty Point Strategy 23.28 balance study</title><style>{style}</style></head><body>{body}</body></html>')
raw=[]
for name in ['main','baseline','old-policy','gifts','long','headtohead']:
 p=ROOT/(name+'.jsonl');content=p.read_bytes() if p.exists() else gzip.decompress((ROOT/(name+'.jsonl.gz')).read_bytes());compressed=gzip.compress(content,mtime=0);(ROOT/(name+'.jsonl.gz')).write_bytes(compressed)
 raw.append({'file':p.name,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'compressedFile':p.name+'.gz','compressedSha256':hashlib.sha256(compressed).hexdigest()})
manifest={'rules':s['rules'],'workingTreeBaseCommit':s['commit'],'freeze':json.loads((ROOT/'freeze.json').read_text()),'raw':raw,'files':{}}
for p in ROOT.iterdir():
 if p.is_file() and p.name!='manifest.json' and p.suffix not in ['.jsonl','.gz']:manifest['files'][p.name]=hashlib.sha256(p.read_bytes()).hexdigest()
(ROOT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print('Wrote standalone report, two plots, six compressed raw datasets and integrity manifest.')
