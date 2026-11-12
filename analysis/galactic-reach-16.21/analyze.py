import json, csv, statistics as st, collections as co, random
from pathlib import Path
ROOT=Path(__file__).resolve().parent
STRATEGIES=['military','economy','expansion']
def mean(xs):
    xs=list(xs);return round(st.mean(xs),3) if xs else None
def percentile(xs,p):
    if not xs:return None
    a=sorted(xs);x=(len(a)-1)*p;i=int(x);return a[i]+(a[min(i+1,len(a)-1)]-a[i])*(x-i)
def summarize(games):
    done=[r for r in games if r['status']=='finished']
    winners=[r['players'][r['winner']] for r in done]
    result={'games':len(games),'status':dict(co.Counter(r['status'] for r in games)),
      'finishRoundMean':mean(r['round'] for r in done),'finishRoundMedian':st.median([r['round'] for r in done]) if done else None,
      'finishRoundP10':percentile([r['round'] for r in done],.1),'finishRoundP90':percentile([r['round'] for r in done],.9),
      'combatsMean':mean(r['metrics']['combats'] for r in done),'zeroCombatGames':sum(r['metrics']['combats']==0 for r in done),
      'tiesForFirst':sum(sum(p['rank']==1 for p in r['players'])>1 for r in done),'byStrategy':{},'bySeat':{},
      'winnerScoreComponents':{k:mean(p[k] for p in winners) for k in ['prestige','colonies','frontierPrestige','shipyardPrestige','relics','deckPrestige','cardsPurchased']}}
    for strategy in STRATEGIES:
        ps=[p for r in done for p in r['players'] if p['strategy']==strategy]
        ws=[p for p in winners if p['strategy']==strategy]
        result['byStrategy'][strategy]={'appearances':len(ps),'wins':len(ws),'shareOfWins':100*len(ws)/len(done) if done else None,'winRatePerAppearance':100*len(ws)/len(ps) if ps else None,
          **{k:mean(p[k] for p in ps) for k in ['prestige','colonies','relics','shipyards','cardsPurchased','controlled','income','capacity','frontierPrestige','deckPrestige','shipyardPrestige']},
          'settlers':mean(p['ships']['settler'] for p in ps),'explorers':mean(p['ships']['explorer'] for p in ps),'fleets':mean(p['ships']['fleet'] for p in ps)}
    for seat in range(4):
        n=sum(r['winner']==seat for r in done)
        result['bySeat'][seat]={'wins':n,'winShare':100*n/len(done) if done else None}
    stalls=[r for r in games if r['status']=='stalled']
    result['stalls']={'count':len(stalls),'medianRound':st.median([r['round'] for r in stalls]) if stalls else None,'actors':dict(co.Counter(r['stall']['strategy'] for r in stalls))}
    # Cluster bootstrap by common-map seed block; all rotations stay together.
    blocks=co.defaultdict(list)
    for r in games:blocks[r['block']].append(r)
    block_stats=[]
    for block in sorted(blocks):
        rs=blocks[block]
        finished=[r for r in rs if r['status']=='finished']
        block_stats.append([len(finished)]+[sum(r['players'][r['winner']]['strategy']==s for r in finished) for s in STRATEGIES]+[sum(r['winner']==s for r in finished) for s in range(4)])
    rng=random.Random(1621);draws=[[] for _ in range(7)]
    for _ in range(2000):
        totals=[0]*8
        for _ in block_stats:
            b=rng.choice(block_stats)
            for i,x in enumerate(b):totals[i]+=x
        if totals[0]:
            for i in range(7):draws[i].append(100*totals[i+1]/totals[0])
    for i,s in enumerate(STRATEGIES):result['byStrategy'][s]['winShareCI95']=[percentile(draws[i],.025),percentile(draws[i],.975)]
    for seat in range(4):result['bySeat'][seat]['winShareCI95']=[percentile(draws[seat+3],.025),percentile(draws[seat+3],.975)]
    result['roundSnapshots']={}
    for round_ in [10,20,24,40,60,80,100]:
        snapshots=[]
        for r in games:
            matches=[s for s in r['snapshots'] if s['round']==round_ and s['phase']=='cleanup']
            if matches:snapshots.append(matches[0])
        result['roundSnapshots'][round_]={'gamesReachingRound':len(snapshots),'byStrategy':{s:{k:mean(p[k] for v in snapshots for p in v['players'] if p['strategy']==s) for k in ['prestige','colonies','relics','cardsPurchased','deckPrestige','shipyards']} for s in STRATEGIES}}
    return result
summary={'rules':'galactic-reach/16.21','sourceCommit':'30ac7a94133b8d493c4856f95999eda255405dc8','notes':[
 'All game rules are unchanged; guarded runs change only the browser bot movement chooser.',
 'Each mixed batch has 64 common-map seed blocks × 3 duplicated profiles × 4 seat rotations = 768 games.',
 'Each mirror batch has 32 seeds × 3 homogeneous four-bot lineups = 96 games.',
 'Win-share neutrality is 33.33% per profile in mixed games; per-player neutrality is 25%.',
 '95% intervals use 2,000 bootstrap resamples of whole seed blocks, not independent player rows.',
 'Unfinished and stalled games are censored and excluded from win-rate denominators; baseline finished-only rates are selection-biased.',
 'Snapshots are end-of-round before next production. Later snapshots exclude games that already ended.',
 'Initial-order controls vary only the starting first-player marker in identical-bot games; these are setup counterfactuals, separate from current-rule results.',
]}
allrows=[]
for mode in ['browser','guarded']:
    rows=[json.loads(s) for s in (ROOT/(mode+'.jsonl')).read_text().splitlines()]
    assert len(rows)==864 and len({r['id'] for r in rows})==864
    assert all('error' not in r for r in rows)
    summary[mode]={design:summarize([r for r in rows if r['design']==design]) for design in ['mixed','mirror']}
    for r in rows:
        for p in r['players']:
            allrows.append({'mode':mode,'design':r['design'],'seed':r['seed'],'block':r['block'],'game':r['id'],'status':r['status'],'round':r['round'],'winnerSeat':r['winner'],'combats':r['metrics']['combats'],**{k:p[k] for k in ['seat','strategy','prestige','colonies','shipyards','relics','cardsPurchased','deckPrestige','frontierPrestige','shipyardPrestige','controlled','income','rank']}})
orders=[json.loads(s) for s in (ROOT/'order-control.jsonl').read_text().splitlines()]
assert len(orders)==384 and all(r['status']=='finished' for r in orders)
guarded=[json.loads(s) for s in (ROOT/'guarded.jsonl').read_text().splitlines()]
mirrors={(r['seed'],r['lineup'][0]):r for r in guarded if r['design']=='mirror'}
for r in orders:
    if r['firstPlayer']==0:
        original=mirrors[r['seed'],r['lineup'][0]]
        assert (r['winner'],r['round'],r['players'])==(original['winner'],original['round'],original['players'])
summary['orderControl']=summarize(orders)
summary['orderControl']['relativeToInitialFirstPlayer']={i:sum((r['winner']-r['firstPlayer'])%4==i for r in orders) for i in range(4)}
summary['orderControl']['matchedDefaultSetupChecks']=96
with (ROOT/'players.csv').open('w') as f:
    writer=csv.DictWriter(f,fieldnames=list(allrows[0]));writer.writeheader();writer.writerows(allrows)
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2))
print(json.dumps({mode:{d:{k:v for k,v in data.items() if k not in ['roundSnapshots']} for d,data in summary[mode].items()} for mode in ['browser','guarded']},indent=2))
