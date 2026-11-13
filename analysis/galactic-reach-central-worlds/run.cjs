// Central-world study: same local game and ledger, with an isolated setup intervention.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {engineAt,seeded}=require('../galactic-reach-16.21/run.cjs');
const {relocate,validate,setupFingerprint,digest}=require('./layout.cjs');
const ROOT='/private/tmp/drawing-board-ten-prestige';
const EXPECTED_ENGINE='556237ff7a64ea8af22172a14e8283085d171cd80235d4d392c29404be80268c';
if(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'prototypes/galactic-reach/app.js'))).digest('hex')!==EXPECTED_ENGINE)throw Error('17.22 engine changed since the baseline study');
const RES=['matter','energy','biomass','data'];
const SCOPES={produceAll:'production',aiUseResources:'conversion',buildUpgrade:'structure',buildShip:'ship',colonizePlanet:'colonize',excavate:'excavate',buyCard:'purchase',upgradeStarter:'starter_upgrade',decommission:'trash',increaseStorage:'storage',trimResourcesToCapacity:'overflow',discardOverflow:'overflow',discardResources:'voluntary_discard',bankTrade:'bank',respondTrade:'player_trade',consortiumGain:'consortium_gain',consortiumExchange:'consortium_trade',resolveHumanSpecial:'card_effect',applyCombatAction:'combat',finishCombat:'combat_reward'};
function once(source,a,b){if(source.split(a).length!==2)throw Error('Instrumentation anchor not unique: '+a);return source.replace(a,b);}
function factory(target=10,instrument=true){return engineAt(ROOT,'browser',source=>{
 source=once(source,'  const VICTORY_TARGET = 10;',`  const VICTORY_TARGET = ${target};`);
 source=once(source,'    state.firstPlayer=options.firstPlayer??0;','    state.firstPlayer=options.firstPlayer??0;\n    options.studySetup(state);');
 if(instrument){
  const wrappers=Object.entries(SCOPES).map(([fn,label])=>`    ${fn}=options.studyWrap('${label}',${fn});`).join('\n');
  source=once(source,'  if (headless) {\n    state = newState();',`  if (headless) {\n${wrappers}\n    state = newState();`);
 }
 return source;
});}
function run(f,task,instrument=true){
 let e,s,scope='other',lastEnd=null,giftApplied=false,steps=0,unchanged=0,stalled=false,initial=null,combats=0;
 const rng=seeded(task.seed),ledger=Array.from({length:4},()=>Object.fromEntries(RES.map(r=>[r,{initial:0,in:{},out:{}}]))),actions=Array.from({length:4},()=>({})),shortages=Array.from({length:4},()=>({checks:0,before:Object.fromEntries(RES.map(r=>[r,0])),after:Object.fromEntries(RES.map(r=>[r,0])),missingAfter:Object.fromEntries(RES.map(r=>[r,0]))}));
 const snapshots=[],milestones=Array.from({length:4},()=>({firstYard:null,firstExplorer:null,firstSettler:null,firstFleet:null,firstColony:null,firstRelic:null})),events=[];
 const add=(obj,key,value)=>obj[key]=(obj[key]||0)+value;
 function deficiency(player,cost,when){const q=shortages[player.id];if(when==='before')q.checks++;for(const r of RES){const n=Math.max(0,(cost[r]||0)-player.resources[r]);if(n){q[when][r]++;if(when==='after')q.missingAfter[r]+=n;}}}
 const options={headless:true,random:rng,capture:x=>{e=x;s=e.state;},
  studySetup:state=>{
   s=state;
   const before=setupFingerprint(s),gameRngCalls=rng.calls();
   if(task.layout==='central'){relocate(s,task.seed);validate(s);}
   const after=setupFingerprint(s);
   if(before!==after||rng.calls()!==gameRngCalls)throw Error('Setup intervention changed ordinary game state or gameplay RNG');
   initial={ordinary:before,terrain:digest({planets:s.planets,clusters:s.clusters}),gameRngCalls};
   if(!instrument)return;
   for(const p of s.players){
    const original=p.resources;for(const r of RES)ledger[p.id][r].initial=original[r];
    p.resources=new Proxy(original,{set(target,key,value){if(RES.includes(key)){const delta=value-target[key];if(delta){const entry=ledger[p.id][key],bucket=delta>0?entry.in:entry.out;add(bucket,scope,Math.abs(delta));}}return Reflect.set(target,key,value);}});
   }
  },
  studyWrap:(label,fn)=>function(...args){
   const previous=scope;scope=label;
   if(label==='conversion')deficiency(args[0],args[2]||{},'before');
   let result;try{result=fn(...args);}finally{scope=previous;}
   if(label==='conversion')deficiency(args[0],args[2]||{},'after');
   const id=Number.isInteger(args[0])?args[0]:null;
   if(id!==null && result===true){
    if(['structure','ship','excavate'].includes(label)&&args[4])return result;
    if(label==='colonize'&&args[3])return result;
    add(actions[id],label,1);
    if(label==='structure'&&args[2]==='starbase'&&milestones[id].firstYard===null)milestones[id].firstYard=s.round;
    if(label==='ship'){const key={settler:'firstSettler',explorer:'firstExplorer',fleet:'firstFleet'}[args[2]];if(key&&milestones[id][key]===null)milestones[id][key]=s.round;}
    if(label==='excavate'&&milestones[id].firstRelic===null)milestones[id].firstRelic=s.round;
    if(label==='colonize'&&milestones[id].firstColony===null)milestones[id].firstColony=s.round;
   }
   return result;
  },
  onEvent:(round,text)=>{if(task.detail)events.push({round,text});},
  onCombat:()=>{combats++;},
  onRoundEnd:()=>{lastEnd=snapshot();if([1,5,10,15,20,25,30,40,60,80,100,120].includes(s.round))snapshots.push(lastEnd);}
 };
 const adapter=f(options);s=e.state;s.players.forEach((p,i)=>p.strategy=task.lineup[i]);
 function snapshot(){return {round:s.round,phase:s.phase,players:s.players.map((p,id)=>{
  const owned=e.controlledPlanets(id),colonies=e.colonyPlanets(id).length,yards=owned.filter(([,p])=>p.upgrade==='starbase').length,ships={settler:0,explorer:0,fleet:0};
  for(const g of Object.values(s.fleets))for(const k of Object.keys(ships))ships[k]+=g[id]?.[k]||0;
  return {seat:id,strategy:p.strategy,prestige:e.calculatePrestige(id),colonies,yards,relics:p.relicsExcavated,bought:p.cardsPurchased,frontierPrestige:Math.floor(Math.max(0,colonies-1)/2),yardPrestige:Math.floor(yards/2),deckPrestige:Math.floor(p.cardsPurchased/8),resources:{...p.resources},capacity:e.playerCapacity(id),ships};
 })};}
 const limit=task.target===20?160:100;
 while(s.winner===null && s.round<=limit && steps<50000){
  if(task.gift && !giftApplied && s.round>=task.gift.round && e.overflowPlayer()<0){
   const previous=scope;scope='experimental_gift';s.players[task.focal].resources[task.gift.resource]+=task.gift.amount;scope=previous;giftApplied=true;
  }
  const before=JSON.stringify(s),calls=rng.calls();
  if(s.pendingCombat){const seat=e.combatActor();if(!e.applyCombatAction(seat,e.chooseCombatAction(e.combatView(seat),e.combatActions(seat))))throw Error('Invalid combat action');}
  else if(e.overflowPlayer()>=0)e.trimResourcesToCapacity(e.overflowPlayer());
  else if(s.phase==='operations')e.runAiOperation();
  else if(s.phase==='buy')e.runAiBuy();
  else throw Error('Unexpected phase '+s.phase);
  steps++;unchanged=before===JSON.stringify(s)&&calls===rng.calls()?unchanged+1:0;if(unchanged>=3){stalled=true;break;}
 }
 const status=s.winner!==null?'finished':stalled?'stalled':'round_limit',final=status==='round_limit'?lastEnd:snapshot();
 const ranks=adapter.standings();const players=final.players.map(p=>({...p,rank:ranks.find(r=>r.seat===p.seat).rank}));
 if(instrument)for(const p of s.players)for(const r of RES){const row=ledger[p.id][r],expected=row.initial+Object.values(row.in).reduce((a,b)=>a+b,0)-Object.values(row.out).reduce((a,b)=>a+b,0);if(expected!==p.resources[r])throw Error(`Ledger mismatch seat${p.id} ${r}: ${expected} vs ${p.resources[r]}`);}
 const mapOutcome=s.clusters.filter(c=>c.kind==='world').map(c=>({id:c.id,center:c.center,colonyOwner:s.planets[c.center].hasColony?s.planets[c.center].owner:null}));
 return {...task,status,winner:s.winner,round:final.round,steps,giftApplied,initial,combats,mapOutcome,players,snapshots,ledger:instrument?ledger:undefined,shortages:instrument?shortages:undefined,actions:instrument?actions:undefined,milestones:instrument?milestones:undefined,events:task.detail?events:undefined};
}
if(!isMainThread&&workerData?.runner==='resource-study'){
 const factories={10:factory(10),20:factory(20)};
 parentPort.on('message',task=>{try{parentPort.postMessage({result:run(factories[task.target],task)});}catch(error){parentPort.postMessage({error:error.stack,task});}});
}else if(isMainThread&&require.main===module){
 const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i<0?d:process.argv[i+1];};
 const suite=arg('suite','main'),seeds=+arg('seeds',64),offset=+arg('offset',2000),workers=+arg('workers',4),target=+arg('target',10),layout=arg('layout','central'),output=path.resolve(arg('output',path.join(__dirname,suite+'.jsonl'))),tasks=[];let id=0;
 const strategies=['military','economy','expansion'];
 for(let n=0;n<seeds;n++)for(const duplicate of strategies){
  const base=[duplicate,...strategies];
  for(let rotation=0;rotation<4;rotation++){
   const task={id:id++,seed:20261111+(n+offset)*7919,block:n+offset,lineup:base.map((_,i)=>base[(i+rotation)%4]),rotation,duplicate,target,layout,design:'mixed',detail:n===0&&rotation===0};
   if(suite==='gifts'){
    task.focal=(4-rotation)%4;task.focalStrategy=duplicate;task.design='gift';task.detail=false;tasks.push({...task,gift:null});
    for(const round of [1,10])for(const resource of RES)tasks.push({...task,id:id++,gift:{round,resource,amount:2}});
   }else tasks.push(task);
  }
 }
 if(suite==='main')for(let n=0;n<Math.ceil(seeds/2);n++)for(const strategy of strategies)tasks.push({id:id++,seed:20261111+(n+offset)*7919,block:n+offset,lineup:Array(4).fill(strategy),target,layout,design:'mirror',detail:false});
 fs.writeFileSync(output,'');fs.writeFileSync(output+'.meta.json',JSON.stringify({engine:ROOT,target,layout,suite,seeds,offset,games:tasks.length,createdAt:new Date().toISOString(),engineSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'prototypes/galactic-reach/app.js'))).digest('hex'),harnessSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),notes:['The unchanged 17.22 local game supplies all bot decisions and 10-point rules. The central condition only relocates terrain and adds one relic-free world before production.','Resource property observers account for every positive/negative write and assert the ledger closes exactly.','Gifts are counterfactual+2units at start of round1 or10, after production overflow is resolved and before any ordinary action.','Focal strategy is duplicated in its four-player lineup and rotated through every home.','Setup intervention uses an independent RNG. Paired games retain original decks, ordinary state, gameplay RNG position, resource tiles on existing worlds, and twelve relic sites. No browser source, saves, or live deployment is changed.']},null,2));
 let next=0,done=0,errors=0;const start=Date.now();
 for(let i=0;i<Math.min(workers,tasks.length);i++){
  const w=new Worker(__filename,{workerData:{runner:'resource-study'}});w.on('message',m=>{done++;if(m.error)errors++;fs.appendFileSync(output,JSON.stringify(m.result||m)+'\n');if(done%48===0||done===tasks.length)console.log(JSON.stringify({suite,target,done,total:tasks.length,errors,seconds:Math.round((Date.now()-start)/1000)}));if(next<tasks.length)w.postMessage(tasks[next++]);else w.terminate();});w.on('error',e=>{console.error(e);process.exitCode=1;});w.postMessage(tasks[next++]);
 }
}
module.exports={factory,run};
