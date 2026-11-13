from pathlib import Path
import ast, json, collections as co, statistics as st, random, csv, html
ROOT=Path(__file__).resolve().parent
RES=['matter','energy','biomass','data'];STRATS=['military','economy','expansion']
FIXED=['structure','ship','colonize','excavate','purchase','storage','combat']
# Reuse the exact prior definitions, without running that study's top-level analysis.
prior=ast.parse((ROOT.parent/'galactic-reach-10-point/analyze.py').read_text())
exec(compile(ast.Module(body=[n for n in prior.body if isinstance(n,ast.FunctionDef)],type_ignores=[]),'<prior analysis functions>','exec'))
baseline=[json.loads(line) for line in (ROOT.parent/'galactic-reach-10-point/main10.jsonl').read_text().splitlines()]
central=load('main.jsonl'); gifts=load('gifts.jsonl')
assert len(baseline)==len(central)==864 and len(gifts)==1728
assert all('error' not in r and r['status']=='finished' for r in baseline+central+gifts)
old=[r for r in baseline if r['design']=='mixed'];new=[r for r in central if r['design']=='mixed']
def ident(r):return (r['seed'],tuple(r['lineup']),r['design'])
old_index={ident(r):r for r in baseline}
paired=[]
for r in new:
 b=old_index[ident(r)]
 paired.append({'block':r['block'],'rounds':r['round']-b['round'],**{s:100*((r['lineup'][r['winner']]==s)-(b['lineup'][b['winner']]==s)) for s in STRATS}})
verification=json.loads((ROOT/'verification.json').read_text())
for r in central:
 expected=verification['controlInitialBySeed'][str(r['seed'])]
 assert r['initial']['ordinary']==expected['ordinary'] and r['initial']['gameRngCalls']==expected['gameRngCalls']
summary={'control':summarize(old),'central':summarize(new),'controlMirror':summarize([r for r in baseline if r['design']=='mirror']),'centralMirror':summarize([r for r in central if r['design']=='mirror']),
 'paired':{'games':len(paired),'meanRoundChange':avg(r['rounds'] for r in paired),'roundChangeCI95':cluster_ci(paired,lambda r:r['rounds']),
 'strategyWinShareChangePP':{s:{'effect':avg(r[s] for r in paired),'CI95':cluster_ci(paired,lambda r:r[s])} for s in STRATS}},
 'resourcesControl':resource_summary(old),'resourcesCentral':resource_summary(new),
 'resourceByStrategy':{s:resource_summary(new,s) for s in STRATS},'gifts':{},'validation':verification}
ref={(r['seed'],r['duplicate'],r['rotation']):r for r in new}
gift_base={(r['seed'],r['duplicate'],r['rotation']):r for r in gifts if r['gift'] is None}
for key,b in gift_base.items():
 original=ref[key]
 for field in ['winner','round','players','ledger','initial','combats','mapOutcome']:assert b[field]==original[field],field
assert len(gift_base)==192
for round_ in [1,10]:
 summary['gifts'][round_]={}
 for resource in RES:
  rows=[]
  for r in gifts:
   if r['gift'] and r['gift']['round']==round_ and r['gift']['resource']==resource:
    b=gift_base[r['seed'],r['duplicate'],r['rotation']];seat=r['focal']
    rows.append({'block':r['block'],'strategy':r['focalStrategy'],'applied':r['giftApplied'],'effect':100*((r['winner']==seat)-(b['winner']==seat))})
  assert len(rows)==192
  summary['gifts'][round_][resource]={'pairs':len(rows),'applied':sum(r['applied'] for r in rows),'effectPP':avg(r['effect'] for r in rows),'CI95':cluster_ci(rows,lambda r:r['effect'],4000)}
summary['activity']={}
for label,rows in [('control',old),('central',new)]:
 n=len(rows)*4
 summary['activity'][label]={'coloniesPerPlayer':avg(p['colonies'] for r in rows for p in r['players']),
 'relicsPerPlayer':avg(p['relics'] for r in rows for p in r['players']),
 'shipCommissionsPerPlayer':sum(a.get('ship',0) for r in rows for a in r['actions'])/n,
 'colonizationsPerPlayer':sum(a.get('colonize',0) for r in rows for a in r['actions'])/n,
 'combatActionsPerPlayer':sum(a.get('combat',0) for r in rows for a in r['actions'])/n}
summary['activity']['central']['combatsPerGame']=avg(r['combats'] for r in new)
summary['milestones']={}
for label,rows in [('control',old),('central',new)]:
 summary['milestones'][label]={}
 for strategy in STRATS:
  pairs=[(r,i) for r in rows for i,p in enumerate(r['players']) if p['strategy']==strategy]
  summary['milestones'][label][strategy]={}
  for milestone in ['firstYard','firstColony','firstExplorer','firstFleet','firstRelic']:
   values=[r['milestones'][i][milestone] for r,i in pairs if r['milestones'][i][milestone] is not None]
   summary['milestones'][label][strategy][milestone]={'playersReaching':len(values),'playerGames':len(pairs),'medianRoundAmongReaching':st.median(values) if values else None}
summary['territory']={}
for name,coords in [('center',{'0,0'}),('corners',{'9,-9','-9,9'}),('ring',{'6,-3','3,-6','-3,-3','-6,3','-3,6','3,3'})]:
 territories=[(r,t) for r in new for t in r['mapOutcome'] if t['center'] in coords]
 summary['territory'][name]={'slots':len(territories),'colonizedPercent':100*sum(t['colonyOwner'] is not None for r,t in territories)/len(territories),
 'colonyOwners':dict(co.Counter(r['lineup'][t['colonyOwner']] for r,t in territories if t['colonyOwner'] is not None)),
 'gamesWithAnyColonyPercent':100*sum(any(t['center'] in coords and t['colonyOwner'] is not None for t in r['mapOutcome']) for r in new)/len(new)}
summary['validation'].update({'newRuns':len(central)+len(gifts),'allNewRunsFinished':True,'resourceLedgersClosed':len(central)+len(gifts),'matchedGiftBaselines':192,'allMainPairsInitialStateMatched':len(central)})
summary['notes']=['The central condition varies neutral world identities and resource tiles across seeds while fixing the approved geometry.','The added center world has no relic, retaining twelve sites and twelve cards.','Paired games start with identical ordinary state, player decks, game RNG position and original resource tiles.','Only terrain placement and the added central world change. Existing 17.22 browser source and live game remain unchanged.','64 seed blocks, 12 mixed games per block; bootstrap intervals resample seed blocks.','Bot profiles are fixed heuristics and do not establish balance for optimal human play.']
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2))
with (ROOT/'resources.csv').open('w') as f:
 columns=['map','resource','generatedPerPlayerGame','fixedSpendPerPlayerGame','flexibleSpendPerPlayerGame','overflowPerPlayerGame','meanEndStock','shortageAfterPerPlayer']
 w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
 for label,data in [('control',summary['resourcesControl']),('central',summary['resourcesCentral'])]:
  for resource,values in data.items():w.writerow({'map':label,'resource':resource,**{k:values[k] for k in columns[2:]}})
def fmt(n):return f'{n:.1f}'
def interval(v):return f'{v[0]:+.1f} to {v[1]:+.1f}'
def table(headings,rows):return '<table><thead><tr>'+''.join(f'<th>{html.escape(h)}</th>' for h in headings)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{html.escape(str(v))}</td>' for v in row)+'</tr>' for row in rows)+'</tbody></table>'
strategy_rows=[]
for s in STRATS:
 a=summary['control']['byStrategy'][s];b=summary['central']['byStrategy'][s];p=summary['paired']['strategyWinShareChangePP'][s]
 strategy_rows.append([s.title(),fmt(a['winShare'])+'%',fmt(b['winShare'])+'%',f'{p["effect"]:+.1f} pp',interval(p['CI95'])+' pp'])
seat_rows=[[str(i+1),fmt(summary['control']['bySeat'][str(i) if str(i) in summary['control']['bySeat'] else i]['winShare'])+'%',fmt(summary['central']['bySeat'][str(i) if str(i) in summary['central']['bySeat'] else i]['winShare'])+'%'] for i in range(4)]
resource_rows=[]
for r in RES:
 a=summary['resourcesControl'][r];b=summary['resourcesCentral'][r]
 resource_rows.append([r.title(),f'{a["generatedPerPlayerGame"]:.1f} → {b["generatedPerPlayerGame"]:.1f}',f'{a["meanEndStock"]:.1f} → {b["meanEndStock"]:.1f}',f'{a["overflowPerPlayerGame"]:.1f} → {b["overflowPerPlayerGame"]:.1f}',f'{a["shortageAfterPerPlayer"]:.1f} → {b["shortageAfterPerPlayer"]:.1f}'])
gift_rows=[[str(round_),r.title(),f'{v["effectPP"]:+.1f} pp',interval(v['CI95'])+' pp'] for round_,data in summary['gifts'].items() for r,v in data.items()]
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Central-world map balance study</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#101820;color:#e5edf4;max-width:1080px;margin:auto;padding:30px}h1,h2{line-height:1.15}h2{margin-top:36px}p{max-width:85ch}a{color:#7de1f6}table{width:100%;border-collapse:collapse;margin:18px 0;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:10px;border-bottom:1px solid #36434e}th{color:#a9bbcb}img{width:100%;height:auto}small{color:#a9bbcb}.scroll{overflow-x:auto}</style><h1>Central-world map balance study</h1>'''
page+=f'<p>768 matched mixed-strategy games per map, across 64 seeds and every seat rotation. Target: 10 Prestige. The intervention has two neutral corner worlds, six symmetric ring worlds, one new center world, and four fixed moons. Existing neutral world identities and resource tiles vary by seed. Twelve relic sites remain; the center has none.</p><p>All {len(central)+len(gifts):,} new simulations completed. The previous map supplies 864 saved controls, with twelve full reruns reproducing their prior outcomes. No published game or browser source was changed.</p>'
page+='<h2>Strategy balance</h2><img src="strategies.png" alt="Win share by strategy before and after the map change"><div class="scroll">'+table(['Profile','Previous map','Central-world map','Paired change','95% interval'],strategy_rows)+'</div>'
page+=f'<p>Median finish: {fmt(summary["control"]["medianRound"])} → {fmt(summary["central"]["medianRound"])} rounds. Paired mean change: {summary["paired"]["meanRoundChange"]:+.1f} rounds (95% interval {interval(summary["paired"]["roundChangeCI95"])}).</p>'
page+='<h2>Seat balance</h2>'+table(['Home / seat','Previous win share','Central-world win share'],seat_rows)
page+='<h2>Resource pressure</h2><p>Values are averages per player per game, previous → central-world map. Shortages count resource-deficient funding checks after conversions; they are not the number of missed turns. Longer games naturally produce and spend more.</p><div class="scroll">'+table(['Resource','Generated','Unspent at finish','Overflow discarded','Funding shortages'],resource_rows)+'</div>'
page+='<h2>Paired resource gifts</h2><p>Add two units of one resource to a focal player at round 1 or 10. Each condition uses 192 pairs over 16 seed blocks and all homes. Effects are changes in that player’s win chance under these bot policies. Intervals crossing zero provide no clear evidence of a benefit or penalty.</p>'+table(['Gift round','Resource','Win-chance effect','95% interval'],gift_rows)
page+='<h2>Use of the new map</h2>'+table(['Region','Colonized slots at finish','Games with a colony there'],[[name.title(),fmt(v['colonizedPercent'])+'%',fmt(v['gamesWithAnyColonyPercent'])+'%'] for name,v in summary['territory'].items()])
dist=verification['nearestNeutralWorldDistances']
page+=f'<p>The nearest neutral world is {dist["control"][0]["mean"]:.2f} → {dist["central"][0]["mean"]:.2f} center steps away on average. The second nearest is {dist["control"][1]["mean"]:.2f} → {dist["central"][1]["mean"]:.2f}. Both nearby worlds are exactly six steps from every home in the proposed geometry.</p>'
page+='<h2>Method and limits</h2><p>The setup intervention occurs before production, after ordinary game setup. It consumes only an independent map RNG. Each pair retains identical player decks, market and relic deck order, gameplay RNG position, home worlds, and resource tiles on the eight original neutral worlds. Gameplay draws can diverge after different decisions. The center adds seven resource hexes but no relic. Costs, scoring, combat, and the corrected 17.22 browser policies are unchanged.</p><p>The full geometry gives each home the same sorted distances to neutral world centers and moons. Resource assignments still vary across seeds. The study validates 1,000 setups and all paired initial-state fingerprints; 24 full games verify that ledger instrumentation does not alter play. Resource ledgers close exactly. All uncertainty intervals resample entire seed blocks, preserving within-seed dependence.</p><p>These profiles are heuristic bots, not optimal humans. This is evidence about this rules-and-policy combination; it does not prove global strategy or resource balance.</p><p><a href="summary.json">Full results</a> · <a href="resources.csv">Resource CSV</a> · <a href="STUDY.md">Intervention specification</a> · <a href="verification.json">Verification record</a></p></html>'
(ROOT/'report.html').write_text(page)
print(json.dumps({'strategy':strategy_rows,'seats':seat_rows,'rounds':summary['paired'],'resources':resource_rows,'gifts':gift_rows,'activity':summary['activity'],'territory':summary['territory'],'validation':{k:v for k,v in summary['validation'].items() if k!='controlInitialBySeed'}},indent=2))
