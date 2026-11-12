const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {factory,run}=require('./run.cjs');
const {relocate,validate,setupFingerprint,digest,NEUTRAL_SLOTS,MOONS,distance}=require('./layout.cjs');
const {seeded}=require('../galactic-reach-16.21/run.cjs');
const old=fs.readFileSync(path.join(__dirname,'../galactic-reach-10-point/main10.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const f=factory(),plain=factory(10,false),record={engine:'galactic-reach/17.22',mapSeeds:1000,controlReproductions:0,pairedInitialStates:0,instrumentationParity:0};
const positions=[...NEUTRAL_SLOTS,[0,0]],key=c=>c.join(','),homes=[[-9,0],[0,-9],[9,0],[0,9]];
for(const transform of [([q,r])=>[r,q],([q,r])=>[-q,-r],([q,r])=>[-r,-q]]){
 assert.deepEqual(new Set(positions.map(c=>key(transform(c)))),new Set(positions.map(key)));
 assert.deepEqual(new Set(MOONS.map(c=>key(transform(c)))),new Set(MOONS.map(key)));
}
const access=homes.map(h=>({worlds:positions.map(c=>distance(h,c)).sort((a,b)=>a-b),moons:MOONS.map(c=>distance(h,c)).sort((a,b)=>a-b)}));
for(const a of access)assert.deepEqual(a,access[0]);record.homeDistanceProfiles=access[0];
const arrangements=new Set(),resources=new Set();
for(let seed=0;seed<1000;seed++){
 const rng=seeded(seed);let checked=false;
 f({headless:true,random:rng,capture:()=>{},studyWrap:(_,fn)=>fn,studySetup:s=>{
  const before=setupFingerprint(s),calls=rng.calls();relocate(s,seed);validate(s);
  assert.equal(setupFingerprint(s),before);assert.equal(rng.calls(),calls);
  arrangements.add(digest(s.clusters.slice(4,12).map(c=>c.center)));
  resources.add(digest(s.clusters[12].coords.map(k=>s.planets[k].type)));
  checked=true;
 }});assert(checked);
}
record.uniqueWorldAssignments=arrangements.size;record.uniqueCenterResourceLayouts=resources.size;
record.controlInitialBySeed={};const nearest={control:[],central:[]};
for(const seed of new Set(old.map(r=>r.seed))){
 const rng=seeded(seed);
 f({headless:true,random:rng,capture:()=>{},studyWrap:(_,fn)=>fn,studySetup:s=>{
  record.controlInitialBySeed[seed]={ordinary:setupFingerprint(s),gameRngCalls:rng.calls()};
  for(const kind of ['control','central']){
   if(kind==='central')relocate(s,seed);
   for(const h of s.clusters.slice(0,4))nearest[kind].push(s.clusters.filter(c=>c.kind==='world'&&c.id>=4).map(c=>distance(h.center.split(',').map(Number),c.center.split(',').map(Number))).sort((a,b)=>a-b));
  }
 }});
}
record.nearestNeutralWorldDistances={};
for(const [kind,rows] of Object.entries(nearest))record.nearestNeutralWorldDistances[kind]=[0,1].map(i=>({mean:rows.reduce((n,r)=>n+r[i],0)/rows.length,min:Math.min(...rows.map(r=>r[i])),max:Math.max(...rows.map(r=>r[i]))}));
const controls=old.filter(r=>r.design==='mixed'&&r.block===2000);
for(const control of controls){
 const a=run(f,{...control,layout:'control'}),b=run(f,{...control,layout:'central'});
 for(const field of ['status','winner','round','steps','players','snapshots','ledger','shortages','actions','milestones'])assert.deepEqual(a[field],control[field],field+' differs from prior control');
 record.controlReproductions++;
 assert.equal(a.initial.ordinary,b.initial.ordinary);assert.equal(a.initial.gameRngCalls,b.initial.gameRngCalls);assert.notEqual(a.initial.terrain,b.initial.terrain);record.pairedInitialStates++;
 for(const condition of [a,b]){
  const unobserved=run(plain,condition,false);
  for(const field of ['status','winner','round','steps','players','snapshots','initial','combats','mapOutcome'])assert.deepEqual(condition[field],unobserved[field],'Instrumentation changed '+field);
  record.instrumentationParity++;
 }
}
fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(record,null,2));console.log(JSON.stringify({...record,controlInitialBySeed:Object.keys(record.controlInitialBySeed).length}));
