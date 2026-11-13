from pathlib import Path
import json,html,base64
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
R=Path(__file__).resolve().parent; D=json.loads((R/'summary.json').read_text()); S=['military','economy','expansion']; RES=['matter','energy','biomass','data']; colors=['#697b91','#188576']
plt.rcParams.update({'font.size':11,'axes.spines.top':False,'axes.spines.right':False,'axes.titleweight':'bold'})
fig,ax=plt.subplots(2,2,figsize=(12,8)); w=.36
for i,p in enumerate(['old','new']):
 q=D['policies'][p];shift=(i-.5)*w
 vals=[q['mixed']['byStrategy'][s]['winShareOfFinished']['mean'] for s in S];ci=np.array([q['mixed']['byStrategy'][s]['winShareOfFinished']['CI95'] for s in S]).T
 ax[0,0].bar(np.arange(3)+shift,vals,w,color=colors[i],yerr=[np.array(vals)-ci[0],ci[1]-np.array(vals)],capsize=3,label=['25.30 control','26.31 current'][i])
 ax[0,1].bar(np.arange(3)+shift,[q['storage'][s]['capacity'] for s in S],w,color=colors[i])
 ax[1,0].bar(np.arange(4)+shift,[100*q['resources'][r]['overflowFractionOfCreated'] for r in RES],w,color=colors[i])
 ax[1,1].bar(np.arange(4)+shift,[q['resources'][r]['fixedSpendPerProductionRound']+q['resources'][r]['flexibleSpendPerProductionRound'] for r in RES],w,color=colors[i])
for a in ax[0]:a.set_xticks(np.arange(3),[s.title() for s in S])
for a in ax[1]:a.set_xticks(np.arange(4),[r.title() for r in RES])
ax[0,0].set(title='Completed mixed-game win share',ylabel='Percent');ax[0,0].axhline(100/3,color='#888',ls=':',lw=1);ax[0,0].legend(fontsize=9)
ax[0,1].set(title='Mean final storage capacity',ylabel='Resources');ax[1,0].set(title='Discarded to overflow / generated',ylabel='Percent');ax[1,1].set(title='Spending excluding storage',ylabel='Resources per player-round')
fig.suptitle('Single-use orders and the ten-Fleet cap · 26.31',fontsize=16);fig.tight_layout();fig.savefig(R/'balance.png',dpi=160);plt.close(fig)
fig,axs=plt.subplots(1,2,figsize=(12,4.5),sharey=True)
for ax,rd in zip(axs,[1,10]):
 q=D['resourceGifts']['new'][str(rd)];m=np.array([q[r]['effectPP']['mean'] for r in RES]);ci=np.array([q[r]['effectPP']['familyCI95'] for r in RES]).T
 ax.errorbar(np.arange(4),m,yerr=[m-ci[0],ci[1]-m],fmt='o',capsize=4,color=colors[1]);ax.axhline(0,color='#888',lw=1);ax.set_xticks(np.arange(4),[r.title() for r in RES]);ax.set(title=f'+2 resources in round {rd}',ylabel='Change in focal win probability (pp)')
fig.suptitle('Resource gifts · family-adjusted 95% seed-block intervals');fig.tight_layout();fig.savefig(R/'gifts.png',dpi=160);plt.close(fig)
def fmt(x,n=1):return 'unavailable' if x is None else f'{x:.{n}f}'
def interval(q):return f"{fmt(q['mean'])} [{fmt(q['CI95'][0])}, {fmt(q['CI95'][1])}]"
def table(head,rows):return '<div class="scroll"><table><thead><tr>'+''.join('<th>'+html.escape(str(c))+'</th>' for c in head)+'</tr></thead><tbody>'+''.join('<tr>'+''.join('<td>'+html.escape(str(c))+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table></div>'
def image(name,alt):return '<img alt="'+alt+'" src="data:image/png;base64,'+base64.b64encode((R/name).read_bytes()).decode()+'">'
body='<h1>Galactic Reach 26.31 balance study</h1><p>2,592 trials with the actual browser rivals. Current rules add single-use Probe/Colonize and raise the Fleet cap from 6 to 10. The ship-count fix changes presentation only. This study compares that combined rules update with exact archived 25.30; it cannot attribute an effect to one rule.</p>'
body+=image('balance.png','Strategy win shares, storage, overflow and useful spending')
body+=table(['Metric','25.30 control','26.31 current'],[[label,*[fn(D['policies'][p]) for p in ['old','new']]] for label,fn in [('Mixed games finished',lambda q:f"{q['mixed']['finished']}/{q['mixed']['games']}"),('Median finish round',lambda q:fmt(q['mixed']['medianFinishRound'])),('Combats per game',lambda q:fmt(q['mixed']['combatsPerGame'],2)),('Mean capacity',lambda q:fmt(q['storage']['all']['capacity'])),('Overflow / generated',lambda q:fmt(q['flows']['overflowPercent'])+'%'),('Non-storage spend / player-round',lambda q:fmt(q['flows']['nonStorageSpendPerPlayerRound'],2))]])
body+='<h2>Strategy results</h2>'+table(['Strategy','25.30 win share 95% CI','26.31 win share 95% CI','26.31 wins / appearances','26.31 mean points'],[[s.title(),interval(D['policies']['old']['mixed']['byStrategy'][s]['winShareOfFinished']),interval(D['policies']['new']['mixed']['byStrategy'][s]['winShareOfFinished']),f"{D['policies']['new']['mixed']['byStrategy'][s]['wins']}/{D['policies']['new']['mixed']['byStrategy'][s]['appearances']}",fmt(D['policies']['new']['mixed']['byStrategy'][s]['prestige'])] for s in S])
body+='<p>Each profile appears512times across 384 mixed games. Equal representation gives a balanced win share of 33.3% (25% per appearance).32 independent setup seeds each contain all 12 lineup/seat rotations. Intervals resample whole seed blocks 10,000 times; games sharing a seed are not independent maps. These describe the three implemented policies, not the best possible human strategies.</p>'
body+=table(['Seat','Current win share 95% CI'],[[str(i+1),interval(D['policies']['new']['mixed']['bySeat'][str(i)])] for i in range(4)])
body+=table(['Winner points by source','25.30','26.31'],[[k,*[fmt(D['policies'][p]['mixed']['winnerComponents'][k]) for p in ['old','new']]] for k in ['colonyPoints','relicPoints','combatPoints']])
l=D['longHorizon'];body+=f'<p>Long-horizon check: {l["finished"]}/{l["games"]} games finished by 300 rounds. Statuses: {html.escape(str(l["statuses"]))}. Same-profile mirror statuses (current): {html.escape(str(D["policies"]["new"]["mirrors"]["statuses"]))}. No cutoff game receives an invented winner.</p>'
body+='<h2>Resources</h2><p>Use and bank demand describe bot behavior. Gift effects test the marginal benefit of two extra resources for those policies. Neither is an intrinsic resource exchange rate. Storage payments are reported separately.</p>'
body+=table(['Resource','Overflow%','Bank requested / round','Non-storage spent / round','Storage spent / round','Shortage% of funding checks'],[[r.title(),fmt(100*D['policies']['new']['resources'][r]['overflowFractionOfCreated']),fmt(D['policies']['new']['resources'][r]['bankRequestsPerProductionRound'],3),fmt(D['policies']['new']['resources'][r]['fixedSpendPerProductionRound']+D['policies']['new']['resources'][r]['flexibleSpendPerProductionRound'],2),fmt(D['policies']['new']['resources'][r]['storageSpendPerProductionRound'],2),fmt(D['policies']['new']['resources'][r]['shortageAfterPercentOfFundingAttempts'])] for r in RES])
body+=image('gifts.png','Marginal effect of two resources with family-adjusted intervals')
body+=table(['Gift','Win effect pp 95% CI','Family 95% CI','Both completed / pairs','Applied'],[[f'R{rd} {r.title()}',interval(D['resourceGifts']['new'][str(rd)][r]['effectPP']),str([round(x,1) for x in D['resourceGifts']['new'][str(rd)][r]['effectPP']['familyCI95']]),f"{D['resourceGifts']['new'][str(rd)][r]['bothComplete']}/192",D['resourceGifts']['new'][str(rd)][r]['applied']] for rd in [1,10] for r in RES])
body+='<p>Each contrast has 192 paired games across 16 setup seeds. Bonuses use the same setup/RNG seed and focal actor as their main-game control. Later decisions can diverge. A game already finished by round 10 receives no gift and remains in the intention-to-treat analysis. Eight contrasts receive family-adjusted intervals. Cutoff bounds are in summary.json.</p>'
body+='<h2>Audit and reproducibility</h2><ul>'+''.join('<li>'+html.escape(n)+'</li>' for n in D['notes'])+'</ul><p>All 2,592 resource ledgers, score components, combat awards and period flows reconcile. All 432 paired initial states match after version normalization.32 distinct randomized setups and moon layouts were used. Observed and uninstrumented execution produce identical states, steps and RNG counts in the verification fixtures. Ordinary cutoff 100 rounds; step cap 50,000; policy weights unchanged. Full freeze, hashes, harness, summary and compressed raw results accompany this report.</p>'
style='body{max-width:1120px;margin:35px auto;padding:0 22px;font:16px/1.55 system-ui;color:#193047;background:#f7f9fb}h1{line-height:1.15}h2{margin-top:32px}table{width:100%;border-collapse:collapse;background:white;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #dce3e9}th{background:#e8eef4}.scroll{overflow:auto}img{max-width:100%;height:auto}p{max-width:100ch}'
(R/'report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Galactic Reach 26.31 balance</title><style>'+style+'</style>'+body+'</html>')
print(R/'report.html')
