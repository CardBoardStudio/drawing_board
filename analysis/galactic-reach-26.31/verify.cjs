const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {factory,run,tasksFor,digest,ROOT}=require('./run.cjs');const {engineAt,seeded}=require('../galactic-reach-16.21/run.cjs');
const record={rules:'galactic-reach/26.31',matchedInitialStates:0,observerPairs:0,plainPairs:0};
const observed=factory(),plain=factory(false),baseline=factory(true,'baseline');
const norm=s=>({...JSON.parse(JSON.stringify(s)),version:25,rulesRevision:30});
for(let block=6000;block<6032;block++){
 let a,b;const seed=20261111+block*7919;plain({headless:true,random:seeded(seed),capture:e=>a=e.state});factory(false,'baseline')({headless:true,random:seeded(seed),capture:e=>b=e.state});assert.deepEqual(norm(a),b);record.matchedInitialStates++;
}
for(const t of tasksFor('main',1,6103).filter(t=>t.design==='mixed'&&t.rotation===0)){
 const a=run(observed,t),b=run(plain,t,false);for(const k of ['status','winner','round','steps','initial','finalState','randomCalls','players'])assert.deepEqual(a[k],b[k]);record.observerPairs++;
}
const raw=engineAt(ROOT,'browser');
for(const t of tasksFor('main',1,6103).filter(t=>t.design==='mixed'&&t.rotation===0)){
 const a=run(observed,t);let e;const rng=seeded(t.seed);raw({headless:true,random:rng,capture:x=>e=x});e.state.players.forEach((p,i)=>p.strategy=t.lineup[i]);let steps=0;
 while(e.state.winner===null&&e.state.round<=100&&steps<50000){const s=e.state;if(s.pendingCombat){const id=e.combatActor();assert(e.applyCombatAction(id,e.chooseCombatAction(e.combatView(id),e.combatActions(id))));}else if(e.overflowPlayer()>=0)e.trimResourcesToCapacity(e.overflowPlayer());else if(s.phase==='operations')e.runAiOperation();else e.runAiBuy();steps++;}
 assert.equal(digest(e.state),a.finalState);assert.equal(steps,a.steps);assert.equal(rng.calls(),a.randomCalls);record.plainPairs++;
}
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify(record));
