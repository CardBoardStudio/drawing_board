from pathlib import Path
import json, os
ROOT=Path(__file__).resolve().parent
os.environ.setdefault('MPLCONFIGDIR',str(ROOT/'.matplotlib'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
summary=json.loads((ROOT/'summary.json').read_text())
data=summary['guarded']['mixed']
games=[json.loads(s) for s in (ROOT/'guarded.jsonl').read_text().splitlines()]
rounds=[r['round'] for r in games if r['design']=='mixed' and r['status']=='finished']
names=['Expansion','Economy','Military'];keys=[n.lower() for n in names]
values=[data['byStrategy'][k]['shareOfWins'] for k in keys]
intervals=[data['byStrategy'][k]['winShareCI95'] for k in keys]
fig,axes=plt.subplots(1,2,figsize=(10.6,4.65))
fig.subplots_adjust(left=.09,right=.985,bottom=.25,top=.79,wspace=.28)
fig.suptitle('Galactic Reach 16.21 — balance simulation',fontsize=15,fontweight='bold',x=.02,y=.975,ha='left')
ax=axes[0]
ax.barh(names,values,color=['#358b6d','#597fbe','#c87a40'],height=.57)
ax.errorbar(values,names,xerr=[[v-b[0] for v,b in zip(values,intervals)],[b[1]-v for v,b in zip(values,intervals)]],fmt='none',ecolor='#253143',capsize=4)
ax.axvline(100/3,color='#66727d',linestyle='--',linewidth=1,label='Equal share: 33.3%')
for i,v in enumerate(values):ax.text(intervals[i][1]+2,i,f'{v:.1f}%',va='center',fontsize=11)
ax.set_xlim(0,90);ax.invert_yaxis();ax.set_xlabel('Share of wins (%)');ax.set_title('Bot strategy performance',loc='left',fontsize=12,pad=13)
ax.legend(loc='lower right',frameon=False,fontsize=9)
ax=axes[1]
ax.hist(rounds,bins=range(20,151,5),color='#597fbe',edgecolor='white')
ax.set_xlim(min(rounds)-5,max(rounds)+5)
ax.axvline(data['finishRoundMedian'],color='#26394d',linewidth=2,label=f"Median: {data['finishRoundMedian']:g} rounds")
ax.set_xlabel('Round when game ended');ax.set_ylabel('Games');ax.set_title('Game length',loc='left',fontsize=12,pad=13);ax.legend(frameon=False,fontsize=10)
for ax in axes:
    ax.spines[['top','right']].set_visible(False)
    ax.grid(axis='x',alpha=.13);ax.set_axisbelow(True)
fig.text(.02,.085,'768 completed games · 64 map seeds · every seat rotation · 95% intervals resample whole seed blocks',fontsize=9,color='#4a5565')
fig.text(.02,.035,'Game rules unchanged. Analysis bots use a legal-move safeguard; results do not establish human-play balance.',fontsize=9,color='#4a5565')
fig.savefig(ROOT/'balance.png',dpi=160,facecolor='white')
fig.savefig(ROOT/'balance.svg',facecolor='white')
print(ROOT/'balance.png')
