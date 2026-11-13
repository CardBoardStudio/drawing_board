from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
ROOT=Path(__file__).resolve().parent
s=json.loads((ROOT/'summary.json').read_text())
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'figure.facecolor':'#101820','axes.facecolor':'#101820','text.color':'#e5edf4','axes.labelcolor':'#e5edf4','xtick.color':'#c6d4df','ytick.color':'#c6d4df','axes.edgecolor':'#50616e','savefig.facecolor':'#101820'})
fig,axes=plt.subplots(1,2,figsize=(11.6,4.3),gridspec_kw={'width_ratios':[1.15,1]})
strategies=['military','economy','expansion'];x=np.arange(3)
for label,offset,color,key in [('Previous map',-.19,'#7e98ae','control'),('Central-world map',.19,'#62d6d1','central')]:
 values=[s[key]['byStrategy'][p]['winShare'] for p in strategies]
 cis=[s[key]['byStrategy'][p]['winShareCI95'] for p in strategies]
 errors=np.array([[v-c[0] for v,c in zip(values,cis)],[c[1]-v for v,c in zip(values,cis)]])
 bars=axes[0].bar(x+offset,values,width=.36,label=label,color=color,yerr=errors,capsize=3,error_kw={'ecolor':'#c6d4df','linewidth':1})
 axes[0].bar_label(bars,labels=[f'{v:.1f}%' for v in values],padding=16,color=color,fontsize=10)
axes[0].set_xticks(x,[p.title() for p in strategies]);axes[0].set_ylabel('Share of wins (%)');axes[0].set_ylim(0,80);axes[0].set_title('Strategy balance',loc='left',fontweight='bold',pad=15)
axes[0].legend(frameon=False,loc='upper left',fontsize=9)
for label,offset,color,key in [('Previous',-.19,'#7e98ae','control'),('Central',.19,'#62d6d1','central')]:
 values=[s[key]['bySeat'][str(i)]['winShare'] for i in range(4)]
 axes[1].bar(np.arange(4)+offset,values,width=.36,color=color)
axes[1].axhline(25,color='#b7c6d2',linestyle='--',linewidth=1,label='Equal share (25%)')
axes[1].set_xticks(range(4),['H1','H2','H3','H4']);axes[1].set_ylim(0,40);axes[1].set_ylabel('Share of wins (%)');axes[1].set_title('Seat balance',loc='left',fontweight='bold',pad=15)
axes[1].legend(frameon=False,loc='upper right',fontsize=9)
for ax in axes:
 ax.spines[['top','right']].set_visible(False);ax.grid(axis='y',alpha=.15);ax.set_axisbelow(True)
fig.text(.06,.02,'768 mixed games per map · 64 matched seed blocks · strategy error bars: 95% seed-block bootstrap intervals',fontsize=9,color='#a9bbcb')
fig.tight_layout(rect=[0,.05,1,1]);fig.savefig(ROOT/'strategies.png',dpi=160);plt.close(fig)
print(ROOT/'strategies.png')
