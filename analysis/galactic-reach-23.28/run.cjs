// Offline research; the production engine and all policy weights stay unchanged.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {seeded}=require('../galactic-reach-16.21/run.cjs');
const {compile}=require('./engine.cjs');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..'),COMMIT=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const EXPECTED_ENGINE=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'prototypes/galactic-reach/app.js'))).digest('hex');
const RES=['matter','energy','biomass','data'],STRATS=['military','economy','expansion'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex'),digest=x=>sha(JSON.stringify(x));
const freeze=path.join(__dirname,'freeze.json');if(fs.existsSync(freeze)&&JSON.parse(fs.readFileSync(freeze)).engineSha256!==EXPECTED_ENGINE)throw Error('Frozen23.28 engine changed');
const SCOPES={produceAll:'production',aiUseResources:'conversion',aiStockpile:'stockpile',buildUpgrade:'structure',buildShip:'ship',colonizePlanet:'colonize',excavate:'excavate',buyCard:'purchase',upgradeStarter:'starter_upgrade',decommission:'trash',increaseStorage:'storage',trimResourcesToCapacity:'overflow',discardOverflow:'overflow',discardResources:'voluntary_discard',bankTrade:'bank',respondTrade:'player_trade',consortiumGain:'consortium_gain',consortiumExchange:'consortium_trade',resolveHumanSpecial:'card_effect',applyCombatAction:'combat',finishCombat:'combat_reward'};
function factory(instrument=true,kind='new'){return compile(kind,instrument,SCOPES);}
function run(f,task,instrument=true){
 let e,s,scope='other',steps=0,unchanged=0,stalled=false,lastEnd=null,giftApplied=false,combats=0;
 const rng=seeded(task.seed),actions=Array.from({length:4},()=>({})),milestones=Array.from({length:4},()=>({firstYard:null,firstSettler:null,firstExplorer:null,firstFleet:null,firstColony:null,firstRelic:null}));
 const ledger=Array.from({length:4},()=>Object.fromEntries(RES.map(r=>[r,{initial:0,in:{},out:{}}])));
 const shortages=Array.from({length:4},()=>({checks:0,before:Object.fromEntries(RES.map(r=>[r,0])),after:Object.fromEntries(RES.map(r=>[r,0])),missingAfter:Object.fromEntries(RES.map(r=>[r,0]))}));
 const periods=['early','middle','late'],periodFlow=Object.fromEntries(periods.map(t=>[t,Object.fromEntries(RES.map(r=>[r,{in:{},out:{},shortageBefore:0,shortageAfter:0}]))]));
 const productionRounds=new Set(),snapshots=[],combatLog=[],events=[];
 const period=()=>s.round<=5?'early':s.round<=10?'middle':'late',add=(o,k,v)=>o[k]=(o[k]||0)+v;
 function deficiency(player,cost,when){const q=shortages[player.id];if(when==='before')q.checks++;for(const r of RES){const n=Math.max(0,(cost[r]||0)-player.resources[r]);if(n){q[when][r]++;periodFlow[period()][r][when==='before'?'shortageBefore':'shortageAfter']++;if(when==='after')q.missingAfter[r]+=n;}}}
 const callbacks={headless:true,random:rng,capture:x=>{e=x;s=e.state;},studySetup:state=>{
  s=state;if(!instrument)return;
  for(const p of s.players){const original=p.resources;for(const r of RES)ledger[p.id][r].initial=original[r];p.resources=new Proxy(original,{set(target,key,value){if(RES.includes(key)){const delta=value-target[key];if(delta){const dir=delta>0?'in':'out';add(ledger[p.id][key][dir],scope,Math.abs(delta));add(periodFlow[period()][key][dir],scope,Math.abs(delta));}}return Reflect.set(target,key,value);}});}
 },studyWrap:(label,fn)=>function(...args){
  const previous=scope;scope=label;const battle=label==='combat_reward'?s?.pendingCombat:null;
  if(label==='production')productionRounds.add(s.round);
  if(label==='conversion')deficiency(args[0],args[2]||{},'before');
  let result;try{result=fn(...args);}finally{scope=previous;}
  if(label==='conversion')deficiency(args[0],args[2]||{},'after');
  if(battle&&!s.pendingCombat)combatLog.push({round:s.round,attacker:battle.attackerId,defender:battle.defenderId,prestigeWinner:s.lastCombat.prestigeWinner,outcome:s.lastCombat.outcome,escaped:{...battle.escapedUnits},destroyed:battle.destroyedCount});
  const id=Number.isInteger(args[0])?args[0]:null;
  if(id!==null&&result===true){
   if(['structure','ship','excavate'].includes(label)&&args[4])return result;
   if(label==='colonize'&&args[3])return result;
   add(actions[id],label,1);
   if(label==='structure'&&args[2]==='starbase'&&milestones[id].firstYard===null)milestones[id].firstYard=s.round;
   if(label==='ship'){const k={settler:'firstSettler',explorer:'firstExplorer',fleet:'firstFleet'}[args[2]];if(k&&milestones[id][k]===null)milestones[id][k]=s.round;}
   if(label==='colonize'&&milestones[id].firstColony===null)milestones[id].firstColony=s.round;
   if(label==='excavate'&&milestones[id].firstRelic===null)milestones[id].firstRelic=s.round;
  }
  return result;
 },onEvent:(round,text)=>{if(task.detail)events.push({round,text});},onCombat:()=>combats++,onRoundEnd:()=>{lastEnd=snapshot();if([1,5,10,15,20,30,40,60,80,100].includes(s.round))snapshots.push(lastEnd);}};
 const adapter=f(callbacks);
 s=e.state;s.players.forEach((p,i)=>p.strategy=task.lineup[i]);
 const map={worlds:s.clusters.filter(c=>c.kind==='world').map(c=>c.center),moons:s.clusters.filter(c=>c.kind==='moon').map(c=>c.center),terrain:Object.entries(s.planets).map(([coord,p])=>[coord,p.type,p.special])};
 const initial={state:digest(s),map:digest(map),moons:map.moons,gameRngCalls:rng.calls(),visibleWorldHexes:Object.keys(adapter.observe(0).planets).length};
 initial.baselineCompatibleState=digest({...s,version:20,rulesRevision:25});
 let legacy=null;
 if(task.generations?.includes('old')){
  let booting=true;const dummy=seeded(task.seed^0x9e3779b9),wrap=callbacks.studyWrap;
  factory(instrument,'old')({...callbacks,random:()=>booting?dummy():rng(),capture:x=>{legacy=x;},studySetup:()=>{},onEvent:(...args)=>{if(!booting)callbacks.onEvent(...args);},onCombat:()=>{if(!booting)callbacks.onCombat();},onRoundEnd:()=>{if(!booting)callbacks.onRoundEnd();},studyWrap:(label,fn)=>{const wrapped=wrap(label,fn);return function(...args){return booting?fn(...args):wrapped(...args);};}});
  booting=false;legacy.setStudyState(s);legacy.setStudySerial(e.getStudySerial());
 }
 const actor=id=>task.generations?.[id]==='old'?legacy:e;
 const act=(engine,fn)=>{if(engine!==e){engine.setStudyState(s);engine.setStudySerial(e.getStudySerial());}try{return fn(engine);}finally{if(engine!==e)e.setStudySerial(engine.getStudySerial());}};
 function snapshot(){return {round:s.round,phase:s.phase,players:s.players.map((p,id)=>{
  const owned=e.controlledPlanets(id),colonies=e.colonyPlanets(id).length,score=e.prestigeBreakdown(id),ships={settler:0,explorer:0,fleet:0};
  for(const g of Object.values(s.fleets))for(const k of Object.keys(ships))ships[k]+=g[id]?.[k]||0;
  const total=s.version===22?colonies+Math.floor(Math.max(0,colonies-1)/2)+(p.relicsExcavated||0)+(p.combatVictories||0):3*colonies+2*(p.relicsExcavated||0)+(p.combatVictories||0);
  if(total!==score.total||total!==e.calculatePrestige(id))throw Error('Score mismatch');
  return {seat:id,strategy:p.strategy,generation:task.generations?.[id]||'new',prestige:total,colonies,colonyPoints:score.colonies,frontierPrestige:score.expansionBonus,relics:p.relicsExcavated||0,relicPoints:score.relics,combatPoints:score.combat,yards:owned.filter(([,p])=>p.upgrade==='starbase').length,controlled:owned.length,bought:p.cardsPurchased,resources:{...p.resources},capacity:e.playerCapacity(id),ships};
 })};}
 const limit=task.roundLimit??100,stepLimit=task.stepLimit??50000;
 while(s.winner===null&&s.round<=limit&&steps<stepLimit){
  if(task.gift&&!giftApplied&&s.round>=task.gift.round&&e.overflowPlayer()<0){const previous=scope;scope='experimental_gift';s.players[task.focal].resources[task.gift.resource]+=task.gift.amount;scope=previous;giftApplied=true;}
  const before=JSON.stringify(s),calls=rng.calls();
  if(s.pendingCombat){const seat=e.combatActor();act(actor(seat),x=>{if(!x.applyCombatAction(seat,x.chooseCombatAction(x.combatView(seat),x.combatActions(seat))))throw Error('Invalid combat action');});}
  else if(e.overflowPlayer()>=0){const id=e.overflowPlayer();act(actor(id),x=>x.trimResourcesToCapacity(id));}
  else if(s.phase==='operations')act(actor(s.activePlayer),x=>x.runAiOperation());else if(s.phase==='buy')act(actor(s.activePlayer),x=>x.runAiBuy());else throw Error('Unexpected phase '+s.phase);
  steps++;unchanged=before===JSON.stringify(s)&&calls===rng.calls()?unchanged+1:0;if(unchanged>=3){stalled=true;break;}
 }
 const status=s.winner!==null?'finished':stalled?'stalled':s.round>limit?'round_limit':'step_limit',final=snapshot(),ranks=adapter.standings();
 const players=final.players.map(p=>({...p,rank:ranks.find(r=>r.seat===p.seat).rank}));
 if(instrument)for(const p of s.players)for(const r of RES){const q=ledger[p.id][r],expected=q.initial+Object.values(q.in).reduce((a,b)=>a+b,0)-Object.values(q.out).reduce((a,b)=>a+b,0);if(expected!==p.resources[r])throw Error('Ledger mismatch');}
 return {...task,status,winner:s.winner,round:s.round,completedRounds:status==='finished'?s.round:Math.max(0,s.round-1),steps,giftApplied,initial,finalState:digest(s),baselineCompatibleFinalState:digest({...s,version:20,rulesRevision:25}),randomCalls:rng.calls(),combats,players,snapshots,lastRoundEnd:status==='finished'?undefined:lastEnd,combatLog:instrument?combatLog:undefined,productionRounds:instrument?[...productionRounds]:undefined,periodFlow:instrument&&task.design!=='gift'?periodFlow:undefined,ledger:instrument?ledger:undefined,shortages:instrument?shortages:undefined,actions:instrument?actions:undefined,milestones:instrument?milestones:undefined,events:task.detail?events:undefined};
}
function tasksFor(suite,seeds,offset){const tasks=[];let id=0;
 if(suite==='headtohead'){for(let n=0;n<seeds;n++)for(const strategy of STRATS)for(let rotation=0;rotation<4;rotation++)tasks.push({id:id++,seed:20261111+(n+offset)*7919,block:n+offset,lineup:Array(4).fill(strategy),generations:Array.from({length:4},(_,i)=>((i+rotation)%4)<2?'new':'old'),rotation,duplicate:strategy,design:'headtohead',detail:false});return tasks;}
 for(let n=0;n<seeds;n++)for(const duplicate of STRATS){const base=[duplicate,...STRATS];for(let rotation=0;rotation<4;rotation++){
  const task={id:id++,seed:20261111+(n+offset)*7919,block:n+offset,lineup:base.map((_,i)=>base[(i+rotation)%4]),rotation,duplicate,design:'mixed',detail:n===0&&rotation===0};
  if(suite==='gifts'){task.focal=(4-rotation)%4;task.focalStrategy=duplicate;task.design='gift';task.detail=false;for(const round of [1,10])for(const resource of RES)tasks.push({...task,id:id++,gift:{round,resource,amount:2}});}else tasks.push(task);
 }}
 if(suite!=='gifts')for(let n=0;n<Math.ceil(seeds/2);n++)for(const strategy of STRATS)tasks.push({id:id++,seed:20261111+(n+offset)*7919,block:n+offset,lineup:Array(4).fill(strategy),design:'mirror',detail:false});
 return tasks;
}
if(!isMainThread&&workerData?.runner==='open-worlds-study'){
 const f=factory(true,workerData.kind||'new');parentPort.on('message',task=>{try{parentPort.postMessage({result:run(f,task)});}catch(error){parentPort.postMessage({error:error.stack,task});}});
}else if(isMainThread&&require.main===module){
 const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i<0?d:process.argv[i+1];};
 const suite=arg('suite','main'),seeds=+arg('seeds',['gifts','headtohead'].includes(suite)?32:suite==='long'?16:64),offset=+arg('offset',2000),workers=+arg('workers',4),roundLimit=+arg('rounds',suite==='long'?300:100),output=path.resolve(arg('output',path.join(__dirname,suite+'.jsonl'))),tasks=tasksFor(suite,seeds,offset).filter(t=>suite!=='long'||t.design==='mixed').map(t=>({...t,roundLimit}));
 fs.writeFileSync(output,'');fs.writeFileSync(output+'.meta.json',JSON.stringify({rules:suite==='baseline'?'galactic-reach/22.27':'galactic-reach/23.28',commit:COMMIT,suite,seeds,offset,workers,games:tasks.length,roundLimit,stepLimit:50000,createdAt:new Date().toISOString(),node:process.version,engineSha256:suite==='baseline'?sha(fs.readFileSync(path.join(ROOT,'crates/galactic-reach/rules/v22-app.js'))):EXPECTED_ENGINE,adapterSha256:sha(fs.readFileSync(path.join(ROOT,suite==='baseline'?'crates/galactic-reach/rules/v22-adapter.js':'prototypes/galactic-reach/adapter.js'))),harnessSha256:sha(fs.readFileSync(__filename)),notes:['Current23.28, frozen22.27 baseline, and old22.27 decisions on23.28 rules (dynamic storage-price API only).' ,'Resource observers consume no RNG and every ledger closes exactly.','All seats rotated per duplicated strategy and map seed.','Only real completed games have winners; cutoffs are reported separately.','Gift controls reuse matching main games; head-to-head actors share one23.28 rules closure and card serial.']},null,2));
 let next=0,done=0,errors=0;const started=Date.now();
 for(let i=0;i<Math.min(workers,tasks.length);i++){const w=new Worker(__filename,{workerData:{runner:'open-worlds-study',kind:suite==='baseline'?'baseline':suite==='old-policy'?'old':'new'}});w.on('message',m=>{done++;if(m.error){errors++;process.exitCode=1;}fs.appendFileSync(output,JSON.stringify(m.result||m)+'\n');if(done%48===0||done===tasks.length)console.log(JSON.stringify({suite,done,total:tasks.length,errors,seconds:Math.round((Date.now()-started)/1000)}));if(next<tasks.length)w.postMessage(tasks[next++]);else w.terminate();});w.on('error',e=>{console.error(e);process.exitCode=1;});w.postMessage(tasks[next++]);}
}
module.exports={factory,run,tasksFor,ROOT,COMMIT,EXPECTED_ENGINE,RES,STRATS,digest};
