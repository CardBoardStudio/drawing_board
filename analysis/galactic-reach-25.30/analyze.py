from pathlib import Path
import collections as co, csv, gzip, hashlib, json, statistics as st, sys
import numpy as np

ROOT=Path(__file__).resolve().parent
RES=['matter','energy','biomass','data']; STRATS=['military','economy','expansion']
FIXED=['structure','ship','colonize','excavate','purchase','combat']
EXCHANGES=['bank','player_trade','consortium_trade','experimental_gift']
PARTIAL='--main-only' in sys.argv
def load(name):
    p=ROOT/(name+'.jsonl')
    if p.exists(): return [json.loads(line) for line in p.open()]
    with gzip.open(str(p)+'.gz','rt') as f: return [json.loads(line) for line in f]
def avg(xs):
    xs=list(xs); return float(np.mean(xs)) if xs else None
weights={}
def ratio(rows,num,den=lambda r:1,family=1):
    groups=co.defaultdict(lambda:[0.,0.])
    for r in rows:
        a=groups[r['block']]; a[0]+=num(r); a[1]+=den(r)
    v=np.array([groups[b] for b in sorted(groups)]); n=len(v)
    if not n or not v[:,1].sum(): return {'mean':None,'CI95':[None,None],'familyCI95':[None,None],'seedBlocks':n}
    if n not in weights: weights[n]=np.random.default_rng(20261112).multinomial(n,np.full(n,1/n),size=10000)
    top=weights[n]@v[:,0]; bottom=weights[n]@v[:,1]; samples=top[bottom>0]/bottom[bottom>0]
    return {'mean':float(v[:,0].sum()/v[:,1].sum()),'CI95':np.quantile(samples,[.025,.975]).tolist(),
            'familyCI95':np.quantile(samples,[.025/family,1-.025/family]).tolist(),'seedBlocks':n}
def validate(r):
    assert 'error' not in r,r
    assert r['initial']['visibleWorldHexes']==91
    assert (r['winner'] is not None)==(r['status']=='finished')
    if r['winner'] is not None: assert r['players'][r['winner']]['prestige'] >= (20 if any(p['colonies'] and p['colonyPoints']==3*p['colonies'] for p in r['players']) else 10)
    for i,p in enumerate(r['players']):
        assert p['prestige']==p['colonyPoints']+p['frontierPrestige']+p['relicPoints']+p['combatPoints']
        for res in RES:
            a=r['ledger'][i][res]
            assert a['initial']+sum(a['in'].values())-sum(a['out'].values())==p['resources'][res]
    assert len(r['combatLog'])==r['combats']
    assert sum(p['combatPoints'] for p in r['players'])==sum(b['prestigeWinner'] is not None for b in r['combatLog'])
    if r.get('periodFlow'):
        for res in RES:
            for direction in ['in','out']:
                assert sum(sum(r['periodFlow'][t][res][direction].values()) for t in ['early','middle','late'])==sum(sum(p[res][direction].values()) for p in r['ledger'])
            assert sum(r['periodFlow'][t][res]['shortageAfter'] for t in ['early','middle','late'])==sum(p['after'][res] for p in r['shortages'])
def key(r):return (r['seed'],r.get('duplicate',r['lineup'][0]),r.get('rotation',-1))
def summarize(rows):
    finished=[r for r in rows if r['status']=='finished']; winners=[r['players'][r['winner']] for r in finished]
    out={'games':len(rows),'seedBlocks':len({r['block'] for r in rows}),'finished':len(finished),'statuses':dict(co.Counter(r['status'] for r in rows)),
         'completionPercent':100*len(finished)/len(rows),'medianFinishRound':st.median(r['round'] for r in finished) if finished else None,
         'meanFinishRound':avg(r['round'] for r in finished),'combatsPerGame':avg(r['combats'] for r in rows),'byStrategy':{},'bySeat':{},
         'winnerComponents':{k:avg(p[k] for p in winners) for k in ['colonyPoints','frontierPrestige','relicPoints','combatPoints']}}
    for strategy in STRATS:
        players=[p for r in rows for p in r['players'] if p['strategy']==strategy]
        wins=sum(r['lineup'][r['winner']]==strategy for r in finished)
        appearances=sum(r['lineup'].count(strategy) for r in rows)
        finished_appearances=sum(r['lineup'].count(strategy) for r in finished)
        out['byStrategy'][strategy]={'wins':wins,'appearances':appearances,'finishedAppearances':finished_appearances,
             'winShareOfFinished':ratio(rows,lambda r:100*(r['winner'] is not None and r['lineup'][r['winner']]==strategy),lambda r:r['winner'] is not None),
             'winRatePerFinishedAppearance':ratio(rows,lambda r:100*(r['winner'] is not None and r['lineup'][r['winner']]==strategy),lambda r:r['lineup'].count(strategy) if r['winner'] is not None else 0),
             'unresolvedWinShareBoundsPercent':[100*wins/len(rows),100*(wins+len(rows)-len(finished))/len(rows)],
             **{k:avg(p[k] for p in players) for k in ['prestige','colonies','yards','relics','bought','frontierPrestige','combatPoints']}}
    for seat in range(4):out['bySeat'][seat]=ratio(rows,lambda r:100*(r['winner']==seat),lambda r:r['winner'] is not None)
    return out
def resources(rows,strategy=None):
    pairs=[(r,i,p) for r in rows for i,p in enumerate(r['players']) if strategy is None or p['strategy']==strategy]
    n=len(pairs); rounds=sum(len(r['productionRounds']) for r,_,_ in pairs); checks=sum(r['shortages'][i]['checks'] for r,i,_ in pairs)
    out={}
    for res in RES:
        ins=co.Counter(); outs=co.Counter()
        for r,i,p in pairs:ins.update(r['ledger'][i][res]['in']);outs.update(r['ledger'][i][res]['out'])
        created=sum(v for k,v in ins.items() if k not in EXCHANGES)
        short=sum(r['shortages'][i]['after'][res] for r,i,_ in pairs)
        out[res]={'playerGames':n,'productionRoundExposures':rounds,'fundingChecks':checks,
          'createdPerPlayerGame':created/n,'createdPerProductionRound':created/rounds,
          'fixedSpendPerProductionRound':sum(outs[k] for k in FIXED)/rounds,'storageSpendPerProductionRound':outs['storage']/rounds,'flexibleSpendPerProductionRound':sum(outs[k] for k in ['starter_upgrade','trash'])/rounds,
          'overflowPerProductionRound':outs['overflow']/rounds,'overflowFractionOfCreated':outs['overflow']/created if created else 0,
          'bankRequestsPerProductionRound':ins['bank']/rounds,'bankOffersPerProductionRound':outs['bank']/4/rounds,
          'meanEndStock':avg(p['resources'][res] for r,i,p in pairs),'shortageAfterCount':short,
          'shortageAfterPercentOfFundingAttempts':100*short/checks if checks else 0,
          'incomeBySourcePerPlayer':{k:v/n for k,v in ins.items()},'outflowByUsePerPlayer':{k:v/n for k,v in outs.items()}}
    return out


def storage(rows):
    out={}
    for strategy in [None]+STRATS:
        ps=[p for r in rows for p in r['players'] if strategy is None or p['strategy']==strategy]
        out[strategy or 'all']={k:avg(p[k] for p in ps) for k in ['capacity','storagePurchases','storageUpgrades','colonies','relics','combatPoints','bought']}
        out[strategy or 'all']['paidUpgradePercent']=100*avg(p['storagePurchases']>0 for p in ps)
    return out

def flows(rows):
    generated=sum(sum(v for k,v in q['in'].items() if k not in EXCHANGES) for r in rows for p in r['ledger'] for q in p.values())
    overflow=sum(q['out'].get('overflow',0) for r in rows for p in r['ledger'] for q in p.values())
    rounds=sum(len(r['productionRounds']) for r in rows)*4
    useful=sum(sum(q['out'].get(k,0) for k in FIXED+['starter_upgrade','trash']) for r in rows for p in r['ledger'] for q in p.values())
    paid=sum(q['out'].get('storage',0) for r in rows for p in r['ledger'] for q in p.values())
    return {'generated':generated,'overflow':overflow,'overflowPercent':100*overflow/generated,'nonStorageSpendPerPlayerRound':useful/rounds,'storageSpendPerPlayerRound':paid/rounds,'playerRounds':rounds}

main=load('main');old=load('baseline');head=load('headtohead');assert len(main)==len(old)==432 and len(head)==192
newmixed=[r for r in main if r['design']=='mixed'];oldmixed=[r for r in old if r['design']=='mixed'];assert len(newmixed)==len(oldmixed)==384
assert len({r['block'] for r in main})==32
for r in main+old+head:validate(r)
index={key(r):r for r in old};assert len(index)==432
for r in main:
    b=index[key(r)] if r['design']=='mixed' else next(x for x in old if x['design']=='mirror' and x['seed']==r['seed'] and x['lineup']==r['lineup'])
    assert r['initial']['baselineCompatibleState']==b['initial']['state']
    assert r['initial']['map']==b['initial']['map'] and r['initial']['gameRngCalls']==b['initial']['gameRngCalls']
summary={'rules':'galactic-reach/25.30','freeze':json.loads((ROOT/'freeze.json').read_text()),'verification':json.loads((ROOT/'verification.json').read_text()),'policies':{},'pairedChanges':{},'headToHead':{},'resourceGifts':{}}
for name,allrows,mixed in [('old',old,oldmixed),('new',main,newmixed)]:
    summary['policies'][name]={'mixed':summarize(mixed),'mirrors':summarize([r for r in allrows if r['design']=='mirror']),'storage':storage(mixed),'flows':flows(mixed),'resources':resources(mixed),'resourceByStrategy':{s:resources(mixed,s) for s in STRATS}}
pairs=[]
oldindex={key(r):r for r in oldmixed}
for r in newmixed:
    b=oldindex[key(r)];both=r['winner'] is not None and b['winner'] is not None
    row={'block':r['block'],'both':both,'finishRoundChange':r['round']-b['round'] if both else 0,'completionChange':100*(int(r['winner'] is not None)-int(b['winner'] is not None))}
    for prefix,g in [('new',r),('old',b)]:row[prefix]=flows([g]);row[prefix+'capacity']=avg(p['capacity'] for p in g['players'])
    pairs.append(row)
summary['pairedChanges']={'completionPP':ratio(pairs,lambda r:r['completionChange']),'finishRoundsAmongBothComplete':ratio(pairs,lambda r:r['finishRoundChange'],lambda r:r['both']),
'capacity':ratio(pairs,lambda r:r['newcapacity']-r['oldcapacity']),
'overflowPP':ratio(pairs,lambda r:r['new']['overflowPercent']-r['old']['overflowPercent']),
'nonStorageSpendPerPlayerRound':ratio(pairs,lambda r:r['new']['nonStorageSpendPerPlayerRound']-r['old']['nonStorageSpendPerPlayerRound'])}
def headsummary(rows):
    done=[r for r in rows if r['winner'] is not None];wins=sum(r['generations'][r['winner']]=='new' for r in done)
    return {'games':len(rows),'finished':len(done),'newWins':wins,'oldWins':len(done)-wins,'newWinPercent':ratio(rows,lambda r:100*(r['winner'] is not None and r['generations'][r['winner']]=='new'),lambda r:r['winner'] is not None),'unresolvedBoundsPercent':[100*wins/len(rows),100*(wins+len(rows)-len(done))/len(rows)]}
for r in head:assert r['generations'].count('new')==r['generations'].count('old')==2
summary['headToHead']={'all':headsummary(head),'byStrategy':{s:headsummary([r for r in head if r['lineup'][0]==s]) for s in STRATS}}
for policy,file,controls in [('new','gifts',newmixed),('old','gifts-old',oldmixed)]:
    gifts=load(file);assert len(gifts)==768;ix={key(r):r for r in controls};assert len({(key(r),r['gift']['round'],r['gift']['resource']) for r in gifts})==768
    summary['resourceGifts'][policy]={}
    for r in gifts:
        validate(r);b=ix[key(r)];assert r['initial']==b['initial'];assert r['lineup'][r['focal']]==r['duplicate']
    for round_ in [1,10]:
        summary['resourceGifts'][policy][round_]={}
        for res in RES:
            rows=[]
            for r in gifts:
                if r['gift']['round']!=round_ or r['gift']['resource']!=res:continue
                b=ix[key(r)];f=r['focal'];bc=b['winner'] is not None;gc=r['winner'] is not None
                bw=int(b['winner']==f) if bc else None;gw=int(r['winner']==f) if gc else None
                rows.append({'block':r['block'],'complete':bc and gc,'effect':100*(gw-bw) if bc and gc else 0,'lower':100*((gw if gc else 0)-(bw if bc else 1)),'upper':100*((gw if gc else 1)-(bw if bc else 0)),'applied':r['giftApplied']})
            assert len(rows)==96
            summary['resourceGifts'][policy][round_][res]={'pairs':96,'bothComplete':sum(r['complete'] for r in rows),'applied':sum(r['applied'] for r in rows),'effectPP':ratio(rows,lambda r:r['effect'],lambda r:r['complete'],family=8),'allPairBoundsPP':[avg(r['lower'] for r in rows),avg(r['upper'] for r in rows)]}
summary['audit']={'totalTrials':2592,'newRulesHumanMechanics':'Nearest-Probe24.29 retained; only storage decisions and explicit AI funding-overflow reserve differ','sameInitialSetups':432,'distinctSetups':len({r['initial']['map'] for r in main}),'distinctMoonLayouts':len({tuple(r['initial']['moons']) for r in main}),'allLedgersScoresCombatAndPeriodsReconciled':True,'roundLimit':100,'nativeArenaPolicy':'21 tested separately; benchmark uses the browser opponents','seedBlockBootstrapReplicates':10000,'giftContrastsPerPolicy':8,'giftBlocks':8,'excluded':'Interrupted old-Probe draft partials and earlier23.28 controls'}
summary['notes']=['Seat rotations share one setup per seed; seed blocks change neutral identities, resources and moons. Map geometry is the approved fixed layout.','Old/new match conditions use the same legal rules and corrected Probe. Separate-policy matches are paired by setup; head-to-head shares one rules closure, RNG and card serial.','Capacity itself is not an outcome of resource usefulness. Storage expenditure is separated from construction/scoring/deck spending. Flow rates include all mixed games, including cutoffs.','Winner shares and gift effects are conditional on completed games; unresolved outcomes have bounds. No game receives an invented winner.','Gift effects are policy-dependent, not intrinsic exchange values. Eight contrasts per policy receive family-adjusted intervals; eight map blocks make these estimates imprecise.','Weights were inherited unchanged from the interrupted draft; comparison seeds were unseen at freeze. No result-driven retuning.']
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({'policies':{p:{k:v for k,v in d.items() if k in ['mixed','storage','flows']} for p,d in summary['policies'].items()},'paired':summary['pairedChanges'],'head':summary['headToHead'],'gifts':summary['resourceGifts']},indent=2))
