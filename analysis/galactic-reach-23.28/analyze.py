from pathlib import Path
import collections as co, csv, gzip, hashlib, json, statistics as st, sys
import numpy as np

ROOT=Path(__file__).resolve().parent
RES=['matter','energy','biomass','data']; STRATS=['military','economy','expansion']
FIXED=['structure','ship','colonize','excavate','purchase','storage','combat']
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
def key(r):return (r['seed'],r['duplicate'],r['rotation'])
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
          'fixedSpendPerProductionRound':sum(outs[k] for k in FIXED)/rounds,'flexibleSpendPerProductionRound':sum(outs[k] for k in ['starter_upgrade','trash'])/rounds,
          'overflowPerProductionRound':outs['overflow']/rounds,'overflowFractionOfCreated':outs['overflow']/created if created else 0,
          'bankRequestsPerProductionRound':ins['bank']/rounds,'bankOffersPerProductionRound':outs['bank']/4/rounds,
          'meanEndStock':avg(p['resources'][res] for r,i,p in pairs),'shortageAfterCount':short,
          'shortageAfterPercentOfFundingAttempts':100*short/checks if checks else 0,
          'incomeBySourcePerPlayer':{k:v/n for k,v in ins.items()},'outflowByUsePerPlayer':{k:v/n for k,v in outs.items()}}
    return out

main=load('main'); assert len(main)==864
for r in main:validate(r)
mixed=[r for r in main if r['design']=='mixed']; mirrors=[r for r in main if r['design']=='mirror']
assert len(mixed)==768 and len({key(r) for r in mixed})==768
assert len(mirrors)==96 and len({(r['seed'],r['lineup'][0]) for r in mirrors})==96
maps=co.defaultdict(set);moons=co.defaultdict(set)
for r in main:maps[r['seed']].add(r['initial']['map']);moons[r['seed']].add(tuple(r['initial']['moons']))
assert len(maps)==64 and all(len(v)==1 for v in maps.values()) and all(len(v)==1 for v in moons.values())
homes=[(-9,0),(0,-9),(9,0),(0,9)]
worlds=homes+[(9,-9),(-9,9),(6,-3),(3,-6),(-3,-3),(-6,3),(-3,6),(3,3),(0,0)]
distance=lambda a,b:max(abs(a[0]-b[0]),abs(a[1]-b[1]),abs(sum(a)-sum(b)))
for positions in moons.values():
    pts=[tuple(map(int,k.split(','))) for k in next(iter(positions))]
    access=[];regions=[]
    for p in pts:
        ds=[distance(p,h) for h in homes];nearest=min(ds)
        assert 4<=nearest<=7 and ds.count(nearest)==1
        access.append(nearest);regions.append(ds.index(nearest))
        assert distance(p,(0,0))<=10 and min(distance(p,w) for w in worlds)>=3
    assert len(set(regions))==4 and max(access)-min(access)<=1
    assert min(distance(a,b) for i,a in enumerate(pts) for b in pts[i+1:])>=6
    nearest=[min(distance(a,b) for j,b in enumerate(pts) if i!=j) for i,a in enumerate(pts)]
    assert max(nearest)-min(nearest)<=2
    assert max(abs(sum(p[0] for p in pts)),abs(sum(p[1] for p in pts)),abs(sum(sum(p) for p in pts)))<=8
summary={'rules':'galactic-reach/23.28','commit':json.loads((ROOT/'main.jsonl.meta.json').read_text())['commit'],'mixed':summarize(mixed),'mirrors':summarize(mirrors),
 'mirrorByStrategy':{s:summarize([r for r in mirrors if r['lineup'][0]==s]) for s in STRATS},
 'resources':resources(mixed),'resourceByStrategy':{s:resources(mixed,s) for s in STRATS},'resourceGifts':{},'longHorizon':{},'milestones':{},'periodResources':{}}
for strategy in STRATS:
    pairs=[(r,i) for r in mixed for i,p in enumerate(r['players']) if p['strategy']==strategy]
    summary['milestones'][strategy]={}
    for k in ['firstYard','firstSettler','firstExplorer','firstFleet','firstColony','firstRelic']:
        values=[r['milestones'][i][k] for r,i in pairs if r['milestones'][i][k] is not None]
        summary['milestones'][strategy][k]={'reached':len(values),'playerGames':len(pairs),'medianRoundAmongReaching':st.median(values) if values else None}
for period in ['early','middle','late']:
    rounds=sum(sum((t<=5 if period=='early' else 5<t<=10 if period=='middle' else t>10) for t in r['productionRounds']) for r in mixed)*4
    data={}
    for res in RES:
        ins=co.Counter();outs=co.Counter()
        for r in mixed:ins.update(r['periodFlow'][period][res]['in']);outs.update(r['periodFlow'][period][res]['out'])
        data[res]={'exposures':rounds,'createdPerProductionRound':sum(v for k,v in ins.items() if k not in EXCHANGES)/rounds,
           'fixedSpendPerProductionRound':sum(outs[k] for k in FIXED)/rounds,'flexibleSpendPerProductionRound':sum(outs[k] for k in ['starter_upgrade','trash'])/rounds,
           'overflowPerProductionRound':outs['overflow']/rounds,'bankRequestsPerProductionRound':ins['bank']/rounds,
           'shortageAfterPer100ProductionRounds':100*sum(r['periodFlow'][period][res]['shortageAfter'] for r in mixed)/rounds}
    summary['periodResources'][period]=data

if not PARTIAL:
    long=load('long');gifts=load('gifts');head=load('headtohead');assert len(long)==192 and len(gifts)==3072 and len(head)==384
    index={key(r):r for r in mixed}
    assert {key(r) for r in long}=={key(r) for r in mixed if r['block']<2016}
    gift_keys={(key(r),r['gift']['round'],r['gift']['resource']) for r in gifts}
    expected={(key(r),t,res) for r in mixed if r['block']<2032 for t in [1,10] for res in RES}
    assert len(gift_keys)==3072 and gift_keys==expected,'Duplicate or missing resource trials'
    for r in long+gifts:
        validate(r);assert r['initial']==index[key(r)]['initial'],'Changed initial setup'
    for r in gifts:assert r['lineup'][r['focal']]==r['focalStrategy']==r['duplicate']
    for r in long:
        b=index[key(r)]
        if b['winner'] is not None:assert (r['winner'],r['round'],r['finalState'])==(b['winner'],b['round'],b['finalState'])
        else:assert b['lastRoundEnd']==next(x for x in r['snapshots'] if x['round']==100)
    summary['longHorizon']={'roundLimit':300,'current':summarize(long),'matched100':summarize([index[key(r)] for r in long])}
    for round_ in [1,10]:
        summary['resourceGifts'][round_]={}
        for res in RES:
            rows=[]
            for r in gifts:
                if r['gift']['round']!=round_ or r['gift']['resource']!=res:continue
                b=index[key(r)];f=r['focal'];bc=b['winner'] is not None;gc=r['winner'] is not None
                bw=int(b['winner']==f) if bc else None;gw=int(r['winner']==f) if gc else None
                yard=r['milestones'][f]['firstYard'];byard=b['milestones'][f]['firstYard']
                rows.append({'block':r['block'],'strategy':r['focalStrategy'],'complete':bc and gc,'effect':100*(gw-bw) if bc and gc else 0,
                    'lower':100*((gw if gc else 0)-(bw if bc else 1)),'upper':100*((gw if gc else 1)-(bw if bc else 0)),
                    'completionEffect':100*(int(gc)-int(bc)),'applied':r['giftApplied'],
                    'yardChange':yard-byard if yard is not None and byard is not None else None,
                    'colonyBy20Change':100*(int(r['milestones'][f]['firstColony'] is not None and r['milestones'][f]['firstColony']<=20)-int(b['milestones'][f]['firstColony'] is not None and b['milestones'][f]['firstColony']<=20))})
            assert len(rows)==384
            summary['resourceGifts'][round_][res]={'pairs':len(rows),'mutuallyFinishedPairs':sum(r['complete'] for r in rows),'applied':sum(r['applied'] for r in rows),
                'winEffectPPAmongMutuallyFinished':ratio(rows,lambda r:r['effect'],lambda r:r['complete'],family=8),
                'allPairsWinEffectBoundsPP':[avg(r['lower'] for r in rows),avg(r['upper'] for r in rows)],
                'completionEffectPP':ratio(rows,lambda r:r['completionEffect'],family=8),
                'firstYardRoundChange':ratio(rows,lambda r:r['yardChange'] if r['yardChange'] is not None else 0,lambda r:r['yardChange'] is not None,family=8),
                'colonyByRound20EffectPP':ratio(rows,lambda r:r['colonyBy20Change'],family=8),
                'byStrategy':{s:ratio([r for r in rows if r['strategy']==s],lambda r:r['effect'],lambda r:r['complete']) for s in STRATS}}
    summary['validation']={**json.loads((ROOT/'verification.json').read_text()),'mainGames':len(main),'giftGames':len(gifts),'longGames':len(long),'headToHeadGames':len(head),'totalRuns':len(main)+len(gifts)+len(long)+len(head)+1728,
       'allLedgersClosed':True,'allScoresReconciled':True,'allCombatAwardsReconciled':True,'allPeriodFlowsReconciled':True,'matchedGiftSetups':len(gifts),'matchedLongSetups':len(long)}
summary['maps']={'seedBlocks':len(maps),'distinctFullSetups':len(set(next(iter(v)) for v in maps.values())),'distinctMoonLayouts':len(set(next(iter(v)) for v in moons.values())),'allRotationsReuseSetup':True,'allMoonGeometryAndAccessBoundsVerified':True}
# Frozen22.27 baseline and a separate old-policy/new-rules condition.
for condition in ['baseline','old-policy']:
    base=load(condition); assert len(base)==864
    for row in base: validate(row)
    oldmixed=[r for r in base if r['design']=='mixed'];oldindex={key(r):r for r in oldmixed}
    assert len(oldindex)==768
    paired=[]
    for row in mixed:
        b=oldindex[key(row)]
        assert row['initial']['map']==b['initial']['map']
        assert row['initial']['gameRngCalls']==b['initial']['gameRngCalls']
        if condition=='old-policy': assert row['initial']==b['initial']
        both=row['winner'] is not None and b['winner'] is not None
        paired.append({'block':row['block'],'completionChange':100*(int(row['winner'] is not None)-int(b['winner'] is not None)),
            'both':both,'finishRoundChange':row['round']-b['round'] if both else 0})
    summary[condition]={'mixed':summarize(oldmixed),'resources':resources(oldmixed),'matchedMapsAndSetupRng':len(paired),
        'completionChangePP':ratio(paired,lambda row:row['completionChange']),
        'mutuallyFinished':sum(row['both'] for row in paired),'finishRoundChangeAmongMutuallyFinished':ratio(paired,lambda row:row['finishRoundChange'],lambda row:row['both'])}
if not PARTIAL:
    assert len({key(r) for r in head})==384
    assert {key(r) for r in head}=={(20261111+n*7919,s,t) for n in range(2000,2032) for s in STRATS for t in range(4)}
    for r in head:
        validate(r)
        assert r['generations'].count('new')==r['generations'].count('old')==2
        control=next(x for x in mirrors if x['seed']==r['seed'] and x['lineup'][0]==r['lineup'][0])
        assert r['initial']==control['initial']
    def headsummary(rows):
        finished=[r for r in rows if r['winner'] is not None]
        wins=sum(r['generations'][r['winner']]=='new' for r in finished)
        out={'games':len(rows),'finished':len(finished),'newWins':wins,'oldWins':len(finished)-wins,
             'medianFinishRound':st.median(r['round'] for r in finished) if finished else None,
             'newWinShareOfFinished':ratio(rows,lambda r:100*(r['winner'] is not None and r['generations'][r['winner']]=='new'),lambda r:r['winner'] is not None),
             'unresolvedNewWinShareBoundsPercent':[100*wins/len(rows),100*(wins+len(rows)-len(finished))/len(rows)],'byGeneration':{}}
        for g in ['new','old']:
            ps=[p for r in rows for p in r['players'] if p['generation']==g]
            out['byGeneration'][g]={k:avg(p[k] for p in ps) for k in ['prestige','colonies','relics','combatPoints','yards','bought']}
        return out
    summary['headToHead']={'all':headsummary(head),'byStrategy':{s:headsummary([r for r in head if r['lineup'][0]==s]) for s in STRATS}}
summary['notes']=[
 'Frozen23.28 browser bots; native arena policy19 is tested separately and is not the policy benchmarked here.',
 'Frozen22.27 baseline differs in scoring and fixed storage prices. The old-policy condition runs22.27 decisions inside23.28 rules, adapting only the dynamic storage-price API.',
 'The rules comparison bundles the scoring schedule, victory threshold and storage costs. It cannot attribute their individual contributions.',
 'Head-to-head old/new actors share23.28 scoring, victory, storage, RNG and card serial. Initial map/deck/market state matches22.27 after normalizing only version metadata and the new zero paid-purchase counter.',
 'Unfinished games are censored; conditional winner shares need completion context. Bootstrap resamples10,000 whole seed blocks.',
 'Resource flows and shortages depend on these policies. Gift trials measure policy-dependent marginal value rather than intrinsic exchange rates. Eight resource/timing contrasts also have family-adjusted intervals.',
 'The legacy baselineCompatibleState hash field is unused by this study; initial states are checked directly by verification.json instead.'
]
name='partial-summary.json' if PARTIAL else 'summary.json';(ROOT/name).write_text(json.dumps(summary,indent=2))
if not PARTIAL:
    fields=['resource','createdPerProductionRound','fixedSpendPerProductionRound','flexibleSpendPerProductionRound','overflowPerProductionRound','bankRequestsPerProductionRound','bankOffersPerProductionRound','meanEndStock','shortageAfterPercentOfFundingAttempts']
    with (ROOT/'resources.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
        for res,data in summary['resources'].items():w.writerow({'resource':res,**{k:data[k] for k in fields[1:]}})
print(json.dumps({k:summary[k] for k in ['mixed','maps','resources','resourceGifts','longHorizon','baseline']+([] if PARTIAL else ['headToHead'])},indent=2))
