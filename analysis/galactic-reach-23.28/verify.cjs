const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {factory,run,tasksFor,digest}=require('./run.cjs');
const record={rules:'galactic-reach/23.28',instrumentedPairs:0,bridgePairs:0,sharedRulesPairs:0,matchedInitialStates:0,plainEnginePairs:0};
const observed=factory(),unobserved=factory(false);
const {engineAt,seeded}=require('../galactic-reach-16.21/run.cjs');
const normalize=state=>{const s=JSON.parse(JSON.stringify(state));delete s.version;delete s.rulesRevision;s.players.forEach(p=>delete p.storagePurchases);return s;};
const baseline=factory(false,'baseline');
for(let n=2000;n<2064;n++){
 let a,b;const seed=20261111+n*7919;
 unobserved({headless:true,random:seeded(seed),capture:e=>a=e.state});baseline({headless:true,random:seeded(seed),capture:e=>b=e.state});
 assert.deepEqual(normalize(a),normalize(b),'Only version and paid-purchase metadata may change setup');record.matchedInitialStates++;
}
for(const task of tasksFor('main',1,1100).filter(t=>t.design==='mixed'&&t.rotation===0)){
 const a=run(observed,task),b=run(unobserved,task,false);
 for(const k of ['status','winner','round','steps','players','snapshots','initial','finalState','randomCalls','combats'])assert.deepEqual(a[k],b[k],'Observers changed '+k);
 record.instrumentedPairs++;
 const old=run(factory(true,'old'),task),bridge=run(observed,{...task,generations:Array(4).fill('old')});
 for(const k of ['status','winner','round','steps','randomCalls','finalState','ledger'])assert.deepEqual(bridge[k],old[k],'All-old bridge changed '+k);
 record.bridgePairs++;
}
const raw=engineAt(path.resolve(__dirname,'../..'),'browser');
for(const task of tasksFor('main',1,1102).filter(t=>t.design==='mixed'&&t.rotation===0)){
 const a=run(observed,task);let e;const rng=seeded(task.seed);raw({headless:true,random:rng,capture:x=>e=x});
 e.state.players.forEach((p,i)=>p.strategy=task.lineup[i]);let steps=0;
 while(e.state.winner===null&&e.state.round<=100&&steps<50000){
  const s=e.state;
  if(s.pendingCombat){const id=e.combatActor();assert(e.applyCombatAction(id,e.chooseCombatAction(e.combatView(id),e.combatActions(id))));}
  else if(e.overflowPlayer()>=0)e.trimResourcesToCapacity(e.overflowPlayer());
  else if(s.phase==='operations')e.runAiOperation();else if(s.phase==='buy')e.runAiBuy();else throw Error(s.phase);
  steps++;
 }
 assert.equal(digest(e.state),a.finalState);assert.equal(steps,a.steps);assert.equal(rng.calls(),a.randomCalls);record.plainEnginePairs++;
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
