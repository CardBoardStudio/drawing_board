from pathlib import Path
import json, collections as co, statistics as st, random
ROOT=Path(__file__).resolve().parent
def load(name):return [json.loads(s) for s in (ROOT/name).read_text().splitlines()]
def quantile(xs,p):
    a=sorted(xs);k=(len(a)-1)*p;i=int(k);return a[i]+(a[min(i+1,len(a)-1)]-a[i])*(k-i)
def describe(rows):
    finished=[r for r in rows if r['status']=='finished'];blocks=co.defaultdict(list)
    for r in rows:blocks[r['block']].append(r)
    counts={seat:sum(r['winnerHome']==seat for r in finished) for seat in range(4)}
    rng=random.Random(210016);boots=[[] for _ in range(4)];keys=sorted(blocks)
    for _ in range(2000):
        sampled=[r for _ in keys for r in blocks[rng.choice(keys)]]
        n=sum(r['status']=='finished' for r in sampled)
        for seat in range(4):boots[seat].append(100*sum(r['winnerHome']==seat for r in sampled)/n)
    return {'games':len(rows),'status':dict(co.Counter(r['status'] for r in rows)),
     'winsByPlayer':dict(co.Counter(r['winner'] for r in finished)),'winsByHome':counts,
     'homeWinShares':{seat:100*n/len(finished) for seat,n in counts.items()},
     'homeCI95':{seat:[quantile(boots[seat],.025),quantile(boots[seat],.975)] for seat in range(4)},
     'meanRound':st.mean(r['round'] for r in finished),
     'round20PrestigeByHome':{seat:st.mean(p['prestige'] for r in rows for snap in r['snapshots'] if snap['round']==20 for p in snap['players'] if p['home']==seat) for seat in range(4)}}
setup=[r for r in load('seat-screen.jsonl') if r['variant'] in ['baseline','owner-rotation','deck-rotation','equal-starters','equal-home-resources']]
(ROOT/'seat-setup-controls.jsonl').write_text(''.join(json.dumps(r)+'\n' for r in setup))
follow=load('seat-followup.jsonl');confirm=load('seat-factorial.jsonl')
assert len(setup)==432 and len(follow)==528 and len(confirm)==768
assert all('error' not in r and r['status']=='finished' for r in setup+follow+confirm)
for r in follow+confirm:
    if r['variant'] in ['inward-yard','inward-relative-paths','inward-affordable','all-policy']:
        assert all(y is None or y['resource']=='energy' for y in r['initialYards'])
screen=co.defaultdict(list)
for r in setup+follow:screen[r['variant']+(':'+str(r['parameter']) if r['parameter'] else '')].append(r)
factorial=co.defaultdict(list)
for r in confirm:factorial[r['variant']].append(r)
assert all(len(a)==96 for a in factorial.values())
baseline={(r['block'],r['strategy']):r for r in factorial['baseline']}
paired={}
for name,rows in factorial.items():
    if name=='baseline':continue
    differences=co.defaultdict(list)
    for r in rows:
        old=baseline[r['block'],r['strategy']]
        differences[r['block']].append((r['winnerHome']==2)-(old['winnerHome']==2))
    block_means=[st.mean(differences[b]) for b in sorted(differences)];rng=random.Random(301621)
    samples=[100*st.mean(rng.choices(block_means,k=len(block_means))) for _ in range(4000)]
    paired[name]={'weakHomeWinShareChangePP':100*st.mean(block_means),'CI95':[quantile(samples,.025),quantile(samples,.975)]}
result={'sourceCommit':'30ac7a94133b8d493c4856f95999eda255405dc8','screenGames':len(setup)+len(follow),'independentConfirmationGames':len(confirm),
 'screen':{k:describe(a) for k,a in screen.items()},'confirmation':{k:describe(a) for k,a in factorial.items()},'pairedVersusBaseline':paired,
 'notes':['The screen uses16 previously studied seeds; the confirmation uses32 fresh seeds, offset1000.','All players in each game use the same policy profile; the three profiles appear equally in every variant.','Intervals resample whole map-seed blocks. Paired effects preserve identical seed/profile comparisons.','Home2 is the weak home identified before this followup, not selected from the current data.','Initial screen forced-yard rows with an inactive hook were excluded; separate followup includes explicit placement assertions.']}
(ROOT/'seat-cause.json').write_text(json.dumps(result,indent=2))
for title,key in [('SCREEN','screen'),('CONFIRMATION','confirmation')]:
    print(title)
    for name,stats in result[key].items():print(name,stats['games'],[round(stats['homeWinShares'][i],1) for i in range(4)])
print('PAIRED',json.dumps(paired,indent=2))
