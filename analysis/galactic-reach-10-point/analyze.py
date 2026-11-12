from pathlib import Path
import json,collections as co,statistics as st,random,csv
ROOT=Path(__file__).resolve().parent
RES=['matter','energy','biomass','data'];STRATS=['military','economy','expansion']
FIXED=['structure','ship','colonize','excavate','purchase','storage','combat']
def load(name):return [json.loads(s) for s in (ROOT/name).read_text().splitlines()]
def quantile(xs,p):
 a=sorted(xs);x=(len(a)-1)*p;i=int(x);return a[i]+(a[min(i+1,len(a)-1)]-a[i])*(x-i)
def avg(xs):
 a=list(xs);return st.mean(a) if a else None
def cluster_ci(rows,value,iterations=2000):
 blocks=co.defaultdict(list)
 for r in rows:blocks[r['block']].append(r)
 means=[avg(value(r) for r in blocks[b]) for b in sorted(blocks)];rng=random.Random(1022)
 samples=[avg(rng.choices(means,k=len(means))) for _ in range(iterations)]
 return [quantile(samples,.025),quantile(samples,.975)]
def summarize(rows):
 finished=[r for r in rows if r['status']=='finished'];winners=[r['players'][r['winner']] for r in finished]
 out={'games':len(rows),'status':dict(co.Counter(r['status'] for r in rows)),
  'medianRound':st.median(r['round'] for r in finished),'meanRound':avg(r['round'] for r in finished),'p10Round':quantile([r['round'] for r in finished],.1),'p90Round':quantile([r['round'] for r in finished],.9),
  'byStrategy':{},'bySeat':{},'winnerScore':{k:avg(p[k] for p in winners) for k in ['prestige','colonies','frontierPrestige','yardPrestige','relics','deckPrestige','bought']}}
 for strategy in STRATS:
  players=[p for r in finished for p in r['players'] if p['strategy']==strategy];wins=sum(r['lineup'][r['winner']]==strategy for r in finished)
  out['byStrategy'][strategy]={'wins':wins,'appearances':len(players),'winShare':100*wins/len(finished),'winRatePerAppearance':100*wins/len(players),
   'winShareCI95':cluster_ci(finished,lambda r:100*(r['lineup'][r['winner']]==strategy)),
   **{k:avg(p[k] for p in players) for k in ['prestige','colonies','yards','relics','bought','frontierPrestige','yardPrestige','deckPrestige']},
   'ships':{k:avg(p['ships'][k] for p in players) for k in ['settler','explorer','fleet']}}
 for seat in range(4):out['bySeat'][seat]={'wins':sum(r['winner']==seat for r in finished),'winShare':100*sum(r['winner']==seat for r in finished)/len(finished),'CI95':cluster_ci(finished,lambda r:100*(r['winner']==seat))}
 return out
main=load('main10.jsonl');control=load('control20.jsonl');gifts=load('gifts.jsonl')
assert len(main)==864 and len(control)==432 and len(gifts)==1728
assert all('error' not in r and r['status']=='finished' for r in main+control+gifts)
main_mixed=[r for r in main if r['design']=='mixed'];main_mirror=[r for r in main if r['design']=='mirror'];control_mixed=[r for r in control if r['design']=='mixed']
matched10=[r for r in main_mixed if r['block']<2032]
summary={'rules':'galactic-reach/17.22','implementationCommit':'be527a90200ee474d96bc951235088152f65f24b',
 'main10':summarize(main_mixed),'mirror10':summarize(main_mirror),'control20':summarize(control_mixed),'matched10':summarize(matched10),'resources':{},'gifts':{},'resourceByStrategy':{}}
control_index={(r['seed'],r['duplicate'],r['rotation']):r for r in control_mixed}
comparisons=[]
for r in matched10:
 old=control_index[r['seed'],r['duplicate'],r['rotation']]
 comparisons.append({'block':r['block'],'roundsSaved':old['round']-r['round'],**{strategy:100*((r['lineup'][r['winner']]==strategy)-(old['lineup'][old['winner']]==strategy)) for strategy in STRATS}})
summary['pairedTargetEffect']={'games':len(comparisons),'meanRoundsSaved':avg(r['roundsSaved'] for r in comparisons),'strategyWinShareChangePP':{strategy:{'effect':avg(r[strategy] for r in comparisons),'CI95':cluster_ci(comparisons,lambda r:r[strategy])} for strategy in STRATS}}
def resource_summary(rows,strategy=None):
 pairs=[(r,i,p) for r in rows for i,p in enumerate(r['players']) if strategy is None or p['strategy']==strategy];n=len(pairs);player_rounds=sum(r['round'] for r,_,_ in pairs)
 out={}
 for resource in RES:
  ins=co.Counter();outs=co.Counter()
  for r,i,p in pairs:ins.update(r['ledger'][i][resource]['in']);outs.update(r['ledger'][i][resource]['out'])
  generated=sum(v for k,v in ins.items() if k not in ['bank','player_trade','consortium_trade','experimental_gift'])
  out[resource]={'playerGames':n,'generatedPerPlayerGame':generated/n,'generatedPerPlayerRound':generated/player_rounds,
   'fixedSpendPerPlayerGame':sum(outs[k] for k in FIXED)/n,'flexibleSpendPerPlayerGame':(outs['starter_upgrade']+outs['trash'])/n,
   'bankRequestsPerPlayerGame':ins['bank']/n,'bankOffersPerPlayerGame':outs['bank']/4/n,
   'overflowPerPlayerGame':outs['overflow']/n,'meanEndStock':avg(p['resources'][resource] for r,i,p in pairs),'medianEndStock':st.median(p['resources'][resource] for r,i,p in pairs),
   'shortageBeforePerPlayer':sum(r['shortages'][i]['before'][resource] for r,i,p in pairs)/n,'shortageAfterPerPlayer':sum(r['shortages'][i]['after'][resource] for r,i,p in pairs)/n,
   'incomeBySourcePerPlayer':{k:v/n for k,v in ins.items()},'outflowByUsePerPlayer':{k:v/n for k,v in outs.items()}}
 return out
summary['resources']=resource_summary(main_mixed)
summary['resourceByStrategy']={s:resource_summary(main_mixed,s) for s in STRATS}
baseline={(r['seed'],r['duplicate'],r['rotation']):r for r in gifts if r['gift'] is None}
reference={(r['seed'],r['duplicate'],r['rotation']):r for r in main_mixed}
for key,b in baseline.items():
 original=reference[key]
 assert (b['winner'],b['round'],b['players'],b['ledger'])==(original['winner'],original['round'],original['players'],original['ledger'])
assert len(baseline)==192
for round_ in [1,10]:
 summary['gifts'][round_]={}
 for resource in RES:
  rows=[]
  for r in gifts:
   if r['gift'] and r['gift']['round']==round_ and r['gift']['resource']==resource:
    b=baseline[r['seed'],r['duplicate'],r['rotation']];seat=r['focal']
    rows.append({'block':r['block'],'strategy':r['focalStrategy'],'applied':r['giftApplied'],'baseWin':b['winner']==seat,'giftWin':r['winner']==seat,'effect':100*((r['winner']==seat)-(b['winner']==seat)),
     'yardChange':None if r['milestones'][seat]['firstYard'] is None or b['milestones'][seat]['firstYard'] is None else r['milestones'][seat]['firstYard']-b['milestones'][seat]['firstYard'],
     'colonyChange':None if r['milestones'][seat]['firstColony'] is None or b['milestones'][seat]['firstColony'] is None else r['milestones'][seat]['firstColony']-b['milestones'][seat]['firstColony']})
  assert len(rows)==192
  result={'pairs':len(rows),'applied':sum(r['applied'] for r in rows),'baseWinRate':100*avg(r['baseWin'] for r in rows),'giftWinRate':100*avg(r['giftWin'] for r in rows),'effectPP':avg(r['effect'] for r in rows),'CI95':cluster_ci(rows,lambda r:r['effect'],4000),
   'meanFirstYardRoundChange':avg(r['yardChange'] for r in rows if r['yardChange'] is not None),
   'byStrategy':{strategy:{'pairs':sum(r['strategy']==strategy for r in rows),'effectPP':avg(r['effect'] for r in rows if r['strategy']==strategy),'CI95':cluster_ci([r for r in rows if r['strategy']==strategy],lambda r:r['effect'])} for strategy in STRATS}}
  summary['gifts'][round_][resource]=result
summary['validation']={'allResourceLedgersClosed':len(main)+len(control)+len(gifts),'matchedGiftBaselines':len(baseline),'observedVersusPlainPilotMatched':True,'updatedPolicyVersusPriorAllPolicy20MatchedGames':12}
summary['notes']=['All10-point main games use the implemented browser AI corrections.','The20-point control changes only the victory target, with the same corrected bots and matched initial map/deck seeds.','Profiles are built-in browser heuristics, not optimal human strategies. Their actual units, colonies, relics and score components are retained.','Resource flow is observational; gross spending alone is not an intrinsic value estimate.','Resource gifts add2units to a focal player, at the start of round1 or10 after production overflow clears. These are paired policy-dependent counterfactuals.','Gift matches use16seed blocks; each focal profile is duplicated and rotated through all4homes.','Negative or zero gift effects can reflect bot decisions and abundance, not a resource being inherently worthless.','95% intervals resample whole seed blocks.']
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2))
with (ROOT/'resources.csv').open('w') as f:
 columns=['strategy','resource','generatedPerPlayerGame','fixedSpendPerPlayerGame','flexibleSpendPerPlayerGame','bankRequestsPerPlayerGame','bankOffersPerPlayerGame','overflowPerPlayerGame','meanEndStock','shortageAfterPerPlayer']
 writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader()
 for strategy,data in [('all',summary['resources'])]+list(summary['resourceByStrategy'].items()):
  for resource,values in data.items():writer.writerow({'strategy':strategy,'resource':resource,**{k:values[k] for k in columns[2:]}})
print(json.dumps({k:summary[k] for k in ['main10','control20','resources','gifts','validation']},indent=2))
