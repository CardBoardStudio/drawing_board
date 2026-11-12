const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {factory,run,tasksFor,digest}=require('./run.cjs');
const record={rules:'galactic-reach/23.28',instrumentedPairs:0,bridgePairs:0,sharedRulesPairs:0};
const observed=factory(),unobserved=factory(false);
for(const task of tasksFor('main',1,1100).filter(t=>t.design==='mixed'&&t.rotation===0)){
 const a=run(observed,task),b=run(unobserved,task,false);
 for(const k of ['status','winner','round','steps','players','snapshots','initial','finalState','randomCalls','combats'])assert.deepEqual(a[k],b[k],'Observers changed '+k);
 record.instrumentedPairs++;
 const old=run(factory(true,'old'),task),bridge=run(observed,{...task,generations:Array(4).fill('old')});
 for(const k of ['status','winner','round','steps','randomCalls','finalState','ledger'])assert.deepEqual(bridge[k],old[k],'All-old bridge changed '+k);
 record.bridgePairs++;
}
for(const task of tasksFor('headtohead',1,1101).filter(t=>t.rotation===0)){
 let captured;const spy=opts=>observed({...opts,capture:e=>{captured=e;opts.capture(e);}});
 const a=run(spy,task),b=run(unobserved,task,false);
 for(const k of ['status','winner','round','steps','players','initial','finalState','randomCalls'])assert.deepEqual(a[k],b[k],'Hybrid observers changed '+k);
 const s=captured.state,ids=[...s.players.flatMap(p=>[...p.hand,...p.deck,...p.discard]),...s.market,...s.advancedDeck,...s.marketDiscard,...s.relicRow,...s.relicDeck].map(c=>c.id);
 assert.equal(new Set(ids).size,ids.length);assert.equal(s.version,23);
 for(let id=0;id<4;id++)assert.equal(captured.calculatePrestige(id),3*captured.colonyPlanets(id).length+2*(s.players[id].relicsExcavated||0)+(s.players[id].combatVictories||0));
 record.sharedRulesPairs++;
}
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));
