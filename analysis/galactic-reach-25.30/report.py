from pathlib import Path
import json,html,base64
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
R=Path(__file__).resolve().parent;D=json.loads((R/'summary.json').read_text());S=['military','economy','expansion'];RES=['matter','energy','biomass','data'];colors=['#697b91','#188576']
plt.rcParams.update({'font.size':11,'axes.spines.top':False,'axes.spines.right':False,'axes.titleweight':'bold'})
fig,ax=plt.subplots(2,2,figsize=(12,8));x=np.arange(3);w=.36
for i,p in enumerate(['old','new']):
 q=D['policies'][p];shift=(i-.5)*w
 ax[0,0].bar(x+shift,[q['storage'][s]['capacity'] for s in S],w,color=colors[i],label=['Previous storage planner','Revised storage planner'][i])
 ax[0,1].bar(x+shift,[100*q['resources'][r]['overflowFractionOfCreated'] for r in RES[:3]],w,color=colors[i]) if False else None
 ax[1,0].bar(np.arange(4)+shift,[100*q['resources'][r]['overflowFractionOfCreated'] for r in RES],w,color=colors[i])
 vals=[q['mixed']['byStrategy'][s]['winShareOfFinished']['mean'] for s in S];ci=np.array([q['mixed']['byStrategy'][s]['winShareOfFinished']['CI95'] for s in S]).T
 ax[0,1].bar(x+shift,vals,w,color=colors[i],yerr=[np.array(vals)-ci[0],ci[1]-np.array(vals)],capsize=3)
 ax[1,1].bar(np.arange(4)+shift,[q['resources'][r]['fixedSpendPerProductionRound']+q['resources'][r]['flexibleSpendPerProductionRound'] for r in RES],w,color=colors[i])
for a in ax[0]:a.set_xticks(x,[s.title() for s in S])
for a in ax[1]:a.set_xticks(np.arange(4),[r.title() for r in RES])
ax[0,0].set(title='Mean final capacity',ylabel='Resources');ax[0,0].legend(fontsize=9)
ax[0,1].set(title='Share of completed mixed-game wins',ylabel='Percent');ax[1,0].set(title='Discarded to overflow / resources generated',ylabel='Percent');ax[1,1].set(title='Spending excluding storage',ylabel='Resources per player-round')
fig.suptitle('Storage planning under corrected nearest-relic Probe',fontsize=16);fig.tight_layout();fig.savefig(R/'storage-balance.png',dpi=160);plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(12,4.6),sharey=True)
for ax,round_ in zip(axs,[1,10]):
 for i,p in enumerate(['old','new']):
  q=D['resourceGifts'][p][str(round_)];means=np.array([q[r]['effectPP']['mean'] for r in RES]);ci=np.array([q[r]['effectPP']['CI95'] for r in RES]).T
  ax.errorbar(np.arange(4)+(i-.5)*.14,means,yerr=[means-ci[0],ci[1]-means],fmt='o',capsize=4,color=colors[i],label=['Previous planner','Revised planner'][i])
 ax.axhline(0,color='#999',lw=1);ax.set_xticks(np.arange(4),[r.title() for r in RES]);ax.set_title(f'+2 resources in round {round_}');ax.set_ylabel('Change in focal win probability (pp)')
axs[0].legend();fig.suptitle('Resource bonus experiments · ordinary95% seed-block intervals');fig.tight_layout();fig.savefig(R/'resource-gifts.png',dpi=160);plt.close(fig)
def fmt(x,n=1):return 'unavailable' if x is None else f'{x:.{n}f}'
def interval(q):return f"{fmt(q['mean'])} [{fmt(q['CI95'][0])}, {fmt(q['CI95'][1])}]"
def table(head,rows):return '<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(str(c))+'</th>' for c in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>'
def image(name,alt):return '<img alt="'+alt+'" src="data:image/png;base64,'+base64.b64encode((R/name).read_bytes()).decode()+'">'
body='<h1>Storage planning and resource balance</h1><p>Galactic Reach25.30 · matched comparison against24.29 storage decisions, both using the corrected nearest-relic Probe rule.2,592 trials; no interrupted old-Probe results reused.</p>'
body+='<h2>Did storage planning change behavior?</h2>'+image('storage-balance.png','Capacity, strategy winners, overflow and non-storage spending')
body+=table(['Metric','Previous planner','Revised planner'],[[label,*[value(D['policies'][p]) for p in ['old','new']]] for label,value in [('Mixed games finished',lambda q:f"{q['mixed']['finished']}/{q['mixed']['games']}"),('Median finish round',lambda q:fmt(q['mixed']['medianFinishRound'])),('Mean capacity',lambda q:fmt(q['storage']['all']['capacity'])),('Mean paid upgrades',lambda q:fmt(q['storage']['all']['storagePurchases'],2)),('Overflow / generated',lambda q:fmt(q['flows']['overflowPercent'])+'%'),('Non-storage spending / player-round',lambda q:fmt(q['flows']['nonStorageSpendPerPlayerRound'],2)),('Storage spending / player-round',lambda q:fmt(q['flows']['storageSpendPerPlayerRound'],2))]])
body+='<p>Matched change in final capacity: '+interval(D['pairedChanges']['capacity'])+'. Change in overflow fraction: '+interval(D['pairedChanges']['overflowPP'])+' percentage points. Change in spending excluding storage: '+interval(D['pairedChanges']['nonStorageSpendPerPlayerRound'])+' resources per player-round. These intervals resample32 whole map/seed blocks10,000 times. The overflow comparison averages within-game differences; the headline flow table pools resource totals, so their estimates need not subtract exactly.</p>'
h=D['headToHead']['all'];body+='<h2>Do the revised bots win more?</h2><p>Two revised and two previous bots of the same strategy play together, rotated across seats on16 separate seed blocks. Revised bots won '+str(h['newWins'])+' of '+str(h['finished'])+' completed games: '+interval(h['newWinPercent'])+'%. '+str(h['games']-h['finished'])+' games reached the100-round cutoff. Unresolved bounds: '+str(h['unresolvedBoundsPercent'])+'%.</p>'
body+=table(['Strategy','Previous win share95% CI','Revised win share95% CI','Revised head-to-head95% CI'],[[s.title(),interval(D['policies']['old']['mixed']['byStrategy'][s]['winShareOfFinished']),interval(D['policies']['new']['mixed']['byStrategy'][s]['winShareOfFinished']),interval(D['headToHead']['byStrategy'][s]['newWinPercent'])] for s in S])
body+='<p>Mixed games duplicate each of Military, Economy and Expansion in turn, then rotate all four seats. Equal representation means a balanced winner share is33.3%. This benchmarks the browser opponents you play against; the native arena policy is tested separately.</p>'
body+='<h2>Are resources equally useful?</h2><p>Spending and bank demand describe what these bots do. Matched resource gifts test how much an extra two resources help these policies win; they are not intrinsic exchange rates. Storage expenditure is separated so paying for capacity cannot by itself be called improved resource usefulness.</p>'+image('resource-gifts.png','Marginal win effect of two-resource gifts')
body+=table(['Resource','Previous overflow%','Revised overflow%','Revised bank requested / round','Revised non-storage spent / round','Revised storage spent / round'],[[r.title(),fmt(100*D['policies']['old']['resources'][r]['overflowFractionOfCreated']),fmt(100*D['policies']['new']['resources'][r]['overflowFractionOfCreated']),fmt(D['policies']['new']['resources'][r]['bankRequestsPerProductionRound'],3),fmt(D['policies']['new']['resources'][r]['fixedSpendPerProductionRound']+D['policies']['new']['resources'][r]['flexibleSpendPerProductionRound'],2),fmt(D['policies']['new']['resources'][r]['storageSpendPerProductionRound'],2)] for r in RES])
body+=table(['Timing/resource','Previous effect pp95% CI','Revised effect pp95% CI','Revised family-adjusted95% CI','Both finished / pairs (revised)'],[[f'R{round_} {r.title()}',interval(D['resourceGifts']['old'][str(round_)][r]['effectPP']),interval(D['resourceGifts']['new'][str(round_)][r]['effectPP']),str([round(x,1) for x in D['resourceGifts']['new'][str(round_)][r]['effectPP']['familyCI95']]),f"{D['resourceGifts']['new'][str(round_)][r]['bothComplete']}/96"] for round_ in [1,10] for r in RES])
body+='<p>Each gift contrast has96 paired games from8 map blocks. Intervals are wide; family intervals adjust for8 contrasts within each policy. Late bonuses in games already over remain unapplied and are retained in the intention-to-treat comparison. Full cutoff bounds and applied counts are in summary.json.</p>'
body+='<h2>Verification and limits</h2><ul>'+''.join('<li>'+html.escape(n)+'</li>' for n in D['notes'])+'</ul><p>All2,592 ledgers balance, point components and combat awards reconcile, and period flows agree with full-game flows. All432 paired initial states match after version normalization. The harness was checked against uninstrumented execution, RNG counts and old-policy bridging. World geometry stays fixed; neutral identities, resource tiles and moons vary by seed. Static charts and this report are standalone artifacts.</p>'
style='body{max-width:1120px;margin:35px auto;padding:0 22px;font:16px/1.55 system-ui;color:#193047;background:#f7f9fb}h1{line-height:1.15}h2{margin-top:32px}table{width:100%;border-collapse:collapse;background:white;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce3e9}th{background:#e8eef4}.scroll{overflow:auto}img{max-width:100%;height:auto}p{max-width:100ch}'
(R/'report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Storage planning25.30</title><style>'+style+'</style>'+body+'</html>')
print(R/'report.html')
