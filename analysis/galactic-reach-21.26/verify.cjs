const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {factory,run,tasksFor,ROOT,EXPECTED_ENGINE,digest}=require('./run.cjs');
const {engineAt,seeded}=require('../galactic-reach-16.21/run.cjs');
const record={rules:'galactic-reach/21.26',engineSha256:EXPECTED_ENGINE,instrumentedPairs:0,plainEnginePairs:0,hybridPairs:0,oldControlPairs:0,allOldBridgePairs:0};
const observed=factory(),unobserved=factory(false),raw=engineAt(ROOT,'browser');
for(const task of tasksFor('main',1,1000).filter(t=>t.design==='mixed'&&t.rotation<=1)){
 const a=run(observed,task),b=run(unobserved,task,false);
 for(const k of ['status','winner','round','steps','players','snapshots','initial','finalState','randomCalls','combats'])assert.deepEqual(a[k],b[k],'Observers changed '+k);
 record.instrumentedPairs++;
 let e;const rng=seeded(task.seed);raw({headless:true,random:rng,capture:x=>e=x});e.state.players.forEach((p,i)=>p.strategy=task.lineup[i]);
 let steps=0;
 while(e.state.winner===null&&e.state.round<=100&&steps<50000){
  const s=e.state;
  if(s.pendingCombat){const id=e.combatActor();assert(e.applyCombatAction(id,e.chooseCombatAction(e.combatView(id),e.combatActions(id))));}
  else if(e.overflowPlayer()>=0)e.trimResourcesToCapacity(e.overflowPlayer());
  else if(s.phase==='operations')e.runAiOperation();else if(s.phase==='buy')e.runAiBuy();else throw Error(s.phase);
  steps++;
 }
 assert.equal(digest(e.state),a.finalState);assert.equal(steps,a.steps);assert.equal(rng.calls(),a.randomCalls);record.plainEnginePairs++;
}
for(const task of tasksFor('headtohead',1,1000).filter(t=>t.rotation<=1)){
 let captured;const spy=opts=>observed({...opts,capture:e=>{captured=e;opts.capture(e);}});
 const a=run(spy,task),b=run(unobserved,task,false);
 for(const k of ['status','winner','round','steps','players','initial','finalState','randomCalls','ledger'])if(k!=='ledger')assert.deepEqual(a[k],b[k],'Hybrid observers changed '+k);
 const s=captured.state,ids=[...s.players.flatMap(p=>[...p.hand,...p.deck,...p.discard]),...s.market,...s.advancedDeck,...s.marketDiscard,...s.relicRow,...s.relicDeck].map(c=>c.id);
 assert.equal(new Set(ids).size,ids.length,'Shared card serials remain unique across old/new policies');record.hybridPairs++;
}
const p=path.join(ROOT,'analysis/galactic-reach-20.25/main.jsonl.gz');
const baseline=fs.existsSync(p)?zlib.gunzipSync(fs.readFileSync(p)).toString().trim().split('\n').map(JSON.parse):[];
const old=factory(true,'old');
for(const duplicate of ['military','economy']){
 const original=baseline.find(r=>r.design==='mixed'&&r.block===2000&&r.duplicate===duplicate&&r.rotation===(duplicate==='military'?0:1));
 const task=original?{seed:original.seed,block:original.block,lineup:original.lineup,duplicate,rotation:original.rotation,design:'mixed',detail:original.detail}:tasksFor('main',1,2000).find(t=>t.duplicate===duplicate&&t.rotation===0);
 const direct=run(old,task);
 if(original){for(const k of ['status','winner','round','steps','finalState','randomCalls','ledger'])assert.deepEqual(direct[k],original[k],'Archived20.25 control differs: '+k);record.oldControlPairs++;}
 const bridge=run(observed,{...task,generations:Array(4).fill('old')});
 assert.equal(bridge.baselineCompatibleFinalState,direct.finalState,'All-old bridge changes archived decisions');
 for(const k of ['status','winner','round','steps','randomCalls','ledger'])assert.deepEqual(bridge[k],direct[k],'All-old bridge differs: '+k);
 record.allOldBridgePairs++;
}
assert(record.instrumentedPairs===6&&record.hybridPairs===6&&record.allOldBridgePairs===2);
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));
