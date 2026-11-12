// Offline balance study. No production files or rules are modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
function option(name,fallback){const i=process.argv.indexOf('--'+name);return i<0?fallback:process.argv[i+1];}
function seeded(seed){let value=seed>>>0,calls=0;const random=()=>{calls++;value=(Math.imul(value,1664525)+1013904223)>>>0;return value/2**32;};random.calls=()=>calls;return random;}
function replaceOnce(source,from,to){if(source.split(from).length!==2)throw Error('Instrumentation anchor not unique: '+from);return source.replace(from,to);}
function engineAt(root,mode,transform=null){
 let source=fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8');
 source=replaceOnce(source,"if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === 0 || state.winner !== null) return;","if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;");
 source=replaceOnce(source,'  function logEvent(text) {','  function logEvent(text) { options.onEvent?.(state.round,text);');
 source=replaceOnce(source,'  function resolveCombat(attackerId, coord, origin, options = {}) {\n    const defenderId','  function resolveCombat(attackerId, coord, origin, options = {}) {\n    recordStudyCombat(attackerId,coord,origin);\n    const defenderId');
 // The observer hook is closure-local and has no access to the RNG.
 source=replaceOnce(source,'  const headless = options.headless === true;','  const headless = options.headless === true;\n  const recordStudyCombat=(...args)=>options.onCombat?.(...args);');
 source=replaceOnce(source,'  function finishRound() {','  function finishRound() { options.onRoundEnd?.();');
 source=replaceOnce(source,'  if (headless) {\n    state = newState();','  if (headless) {\n    state = newState();\n    state.firstPlayer=options.firstPlayer??0;');
 source=replaceOnce(source,'    return createGalacticAdapter({',`    options.capture({get state(){return state;},runAiOperation,runAiBuy,combatActor,combatView,combatActions,applyCombatAction,chooseCombatAction,trimResourcesToCapacity,overflowPlayer,calculatePrestige,colonyPlanets,controlledPlanets,totalResources,playerCapacity,ownerProductionAmount,fleetControllersAt,chooseAiMove,chooseAiBuild,ALL_CARDS,SHIP_STATS,STRUCTURES,EXCAVATION_COST,canAfford,findColonizeTarget,executeMove});
    return createGalacticAdapter({`);
 if(mode==='guarded'){
   source=replaceOnce(source,"        for (let i=0;i<Math.min(range,path.length);i+=1) {","        const legalDestinations=new Set(reachableFrom(source,playerId,range,ALL_CARDS[card.key]?.tag==='pathfinder',ships));\n        for (let i=0;i<Math.min(range,path.length);i+=1) {");
   source=replaceOnce(source,'          destination = candidate;','          if (legalDestinations.has(candidate)) destination = candidate;');
   source=replaceOnce(source,"        if (!best || score > best.score) best = { source,destination,score,moveGroup:'ships' };","        if (destination!==source && (!best || score > best.score)) best = { source,destination,score,moveGroup:'ships' };");
   source=replaceOnce(source,"      performMoveOrder(id,move.source,move.destination,moveCard,{tag:definition.tag,moveGroup:move.moveGroup});\n      return;","      if (performMoveOrder(id,move.source,move.destination,moveCard,{tag:definition.tag,moveGroup:move.moveGroup})) return;");
 }
 if(transform)source=transform(source);
 const adapter=fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8');
 return new Function('module',adapter+'\n'+source+'\nreturn module.exports;')({exports:{}});
}
function simulate(factory,task,limit){
 const random=seeded(task.seed),events=[],metrics={combats:0,events:0,built:{},bankTrades:0,trades:0,discarded:0},snapshots=[];let e,lastEnd=null;
 const adapter=factory({headless:true,random,firstPlayer:task.firstPlayer??0,capture:x=>e=x,onEvent:(round,text)=>{
  metrics.events++;if(task.detail)events.push({round,text});
  if(/ built /.test(text)){const key=text.match(/ built (.*?) at /)?.[1]||text;metrics.built[key]=(metrics.built[key]||0)+1;}
  if(/bank/.test(text))metrics.bankTrades++;
  if(/accepted.*trade|trade.*accepted/i.test(text))metrics.trades++;
 },onCombat:()=>metrics.combats++,onRoundEnd:()=>{lastEnd=snapshot();if([1,5,10,20,24,40,60,80,100,120,160].includes(e.state.round))snapshots.push(lastEnd);}});
 e.state.players.forEach((p,i)=>p.strategy=task.lineup[i]);
 function snapshot(){const s=e.state;return {round:s.round,phase:s.phase,players:s.players.map((p,id)=>{
  const colonies=e.colonyPlanets(id).length,shipyards=e.controlledPlanets(id).filter(([,p])=>p.upgrade==='starbase').length;
  const ships={settler:0,explorer:0,fleet:0};Object.values(s.fleets).forEach(g=>Object.keys(ships).forEach(k=>ships[k]+=g[id]?.[k]||0));
  return {seat:id,strategy:p.strategy,prestige:e.calculatePrestige(id),colonies,shipyards,relics:p.relicsExcavated,cardsPurchased:p.cardsPurchased,frontierPrestige:Math.floor(Math.max(0,colonies-1)/2),shipyardPrestige:Math.floor(shipyards/2),deckPrestige:Math.floor(p.cardsPurchased/8),controlled:e.controlledPlanets(id).length,resources:{...p.resources},capacity:e.playerCapacity(id),hand:p.hand.length,deck:p.deck.length,discard:p.discard.length,ships,
   income:e.controlledPlanets(id).filter(([,p])=>p.occupiedBy===null).reduce((n,[,p])=>n+e.ownerProductionAmount(p),0)+Object.entries(s.planets).filter(([coord,p])=>p.type!=='moon'&&e.fleetControllersAt(coord).includes(id)).length};
 })};}
 let steps=0,noProgress=0,stall=null;
 while(e.state.winner===null && e.state.round<=limit && steps<50000){
  const before=JSON.stringify(e.state),calls=random.calls(),s=e.state;
  if(s.pendingCombat){const seat=e.combatActor();const action=e.chooseCombatAction(e.combatView(seat),e.combatActions(seat));if(!e.applyCombatAction(seat,action))throw Error('Invalid combat chooser');}
  else if(e.overflowPlayer()>=0){metrics.discarded+=e.trimResourcesToCapacity(e.overflowPlayer());}
  else if(s.phase==='operations')e.runAiOperation();
  else if(s.phase==='buy')e.runAiBuy();
  else throw Error('Unhandled phase '+s.phase);
  steps++;
  noProgress=before===JSON.stringify(e.state)&&calls===random.calls()?noProgress+1:0;
  if(noProgress>=3){const id=e.state.activePlayer,card=e.state.players[id].hand.find(c=>e.ALL_CARDS[c.key].order==='move');stall={round:e.state.round,seat:id,strategy:e.state.players[id].strategy,phase:e.state.phase,move:e.chooseAiMove(id,card),build:e.chooseAiBuild(id),log:e.state.log.slice(0,6)};break;}
 }
 const status=e.state.winner!==null?'finished':stall?'stalled':e.state.round>limit?'round_limit':'step_limit';
 const final=status==='round_limit'?lastEnd:snapshot();snapshots.push(final);
 const ranks=adapter.standings();
 return {...task,winner:e.state.winner,status,round:final.round,stateRound:e.state.round,steps,randomCalls:random.calls(),metrics,players:final.players.map(p=>({...p,rank:ranks.find(r=>r.seat===p.seat).rank})),snapshots,stall,events:task.detail?events:undefined,lastLog:e.state.log.slice(0,12)};
}
if(!isMainThread && workerData?.runner==='balance-run'){
 const factory=engineAt(workerData.root,workerData.mode);
 parentPort.on('message',task=>{try{const start=Date.now();parentPort.postMessage({result:simulate(factory,task,workerData.rounds),milliseconds:Date.now()-start});}catch(error){parentPort.postMessage({error:error.stack,task});}});
}else if(isMainThread && require.main===module){
 const root=option('engine','/private/tmp/drawing-board-compact-frontier'),mode=option('mode','browser'),seeds=Number(option('seeds','16')),rounds=Number(option('rounds','120')),workers=Number(option('workers','4'));
 const output=path.resolve(option('output',path.join(__dirname,mode+'.jsonl'))),tasks=[],strategies=['military','economy','expansion'];let id=0;
 const pilot=option('pilot','0')==='1',legacy=option('legacy','0')==='1',orderControl=option('order-control','0')==='1';
 if(pilot)tasks.push({id:id++,block:0,seed:20261011,lineup:['military','military','economy','expansion'],design:'pilot',detail:true});
 else if(legacy){let assignmentIndex=0;for(const duplicate of strategies){const base=[duplicate,...strategies];for(let rotation=0;rotation<4;rotation++)tasks.push({id:id++,block:0,seed:20261011+(assignmentIndex++)*100003,lineup:base.map((_,i)=>base[(i+rotation)%4]),design:'legacy',detail:true});}}
 else if(orderControl){for(let n=0;n<seeds;n++)for(const strategy of strategies)for(let firstPlayer=0;firstPlayer<4;firstPlayer++)tasks.push({id:id++,block:n,seed:20261111+n*7919,lineup:Array(4).fill(strategy),design:'order-control',firstPlayer,detail:false});}
 else {
  for(let n=0;n<seeds;n++)for(const duplicate of strategies){const base=[duplicate,...strategies];for(let rotation=0;rotation<4;rotation++)tasks.push({id:id++,block:n,seed:20261111+n*7919,lineup:base.map((_,i)=>base[(i+rotation)%4]),design:'mixed',rotation,duplicate,detail:n===0&&rotation===0});}
  for(let n=0;n<Math.ceil(seeds/2);n++)for(const strategy of strategies)tasks.push({id:id++,block:n,seed:20261111+n*7919,lineup:Array(4).fill(strategy),design:'mirror',detail:n===0});
 }
 fs.writeFileSync(output,'');
 fs.writeFileSync(output+'.meta.json',JSON.stringify({engine:root,mode,seeds,rounds,workers,games:tasks.length,createdAt:new Date().toISOString(),engineSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'))).digest('hex'),node:process.version,notes:['No game rules changed. Browser seat0 guard removed to allow four bots.','Instrumented closure-local observers consume no random numbers.','Stall means three identical state transitions with no RNG consumption.','Guarded mode checks move destinations and continues after failed movement; only policy decisions differ.','Mixed lineups use common seed blocks, every rotation and each duplicated strategy.','Round/step limits are censored, never counted as victories.']},null,2));
 let next=0,done=0,errors=0;const start=Date.now();
 function launch(){const w=new Worker(__filename,{workerData:{runner:'balance-run',root,mode,rounds}});w.on('message',m=>{if(m.error){errors++;fs.appendFileSync(output,JSON.stringify(m)+'\n');}else fs.appendFileSync(output,JSON.stringify({...m.result,milliseconds:m.milliseconds})+'\n');done++;if(done%12===0||done===tasks.length)console.log(JSON.stringify({mode,done,total:tasks.length,errors,seconds:Math.round((Date.now()-start)/1000)}));if(next<tasks.length)w.postMessage(tasks[next++]);else w.terminate();});w.on('error',e=>{console.error(e);process.exitCode=1;});if(next<tasks.length)w.postMessage(tasks[next++]);else w.terminate();}
 for(let n=0;n<Math.min(workers,tasks.length);n++)launch();
}
module.exports={engineAt,simulate,seeded};
