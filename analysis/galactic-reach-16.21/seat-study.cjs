// Causal seat diagnostics over the unchanged 16.21 engine.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {engineAt,seeded}=require('./run.cjs');
const ROOT='/private/tmp/drawing-board-compact-frontier';
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
function replaceOnce(s,a,b){if(s.split(a).length!==2)throw Error('Bad study anchor '+a);return s.replace(a,b);}
function factory(){return engineAt(ROOT,'guarded',source=>{
 source=replaceOnce(source,'  const recordStudyCombat=(...args)=>options.onCombat?.(...args);','  const recordStudyCombat=(...args)=>options.onCombat?.(...args);\n  const preferStudyYard=(id,coord)=>options.preferInitialYard?.(id,coord);\n  const relativeStudyNeighbors=(coord,id)=>options.relativeNeighbors?.(coord,id,movementNeighbors(coord)) || movementNeighbors(coord);\n  const preferAffordableStudyBuild=options.preferAffordableBuild===true;');
 source=replaceOnce(source,'    state.firstPlayer=options.firstPlayer??0;','    state.firstPlayer=options.firstPlayer??0;\n    options.setupState?.(state);');
 source=replaceOnce(source,"score:starbases.length===0?16:5+(player.strategy==='military'?4:0)","score:starbases.length===0?16+(preferStudyYard(playerId,coord)?0.1:0):5+(player.strategy==='military'?4:0)");
 source=replaceOnce(source,'    planet.upgradeLevel = improving ? 2 : 1;','    planet.upgradeLevel = improving ? 2 : 1;\n    options.onStructure?.(state,playerId,coord,type,improving);');
 source=replaceOnce(source,'  function pathToCoord(source, goal) {','  function pathToCoord(source, goal, playerId) {');
 source=replaceOnce(source,'pathToCoord(source,relicGoal);','pathToCoord(source,relicGoal,playerId);');
 const neighbors='for (const next of movementNeighbors(current)) if (!came.has(next))';
 if(source.split(neighbors).length!==3)throw Error('Expected two AI BFS neighbor loops');
 source=source.replaceAll(neighbors,'for (const next of relativeStudyNeighbors(current,playerId)) if (!came.has(next))');
 source=replaceOnce(source,'    return options.sort((a,b)=>b.score-a.score)[0] || null;',`    const rankedStudyBuilds=options.sort((a,b)=>b.score-a.score);
    if (preferAffordableStudyBuild && starbases.length) {
      const order=player.hand.find(card=>ALL_CARDS[card.key].order==='construct');
      const affordable=rankedStudyBuilds.filter(build=>{
        const discount=order?.upgraded?[...RESOURCES].filter(r=>build.cost[r]>0).sort((a,b)=>((build.cost[b]||0)-player.resources[b])-((build.cost[a]||0)-player.resources[a]))[0]||null:null;
        return canAfford(player,constructionCost(playerId,build.coord,build.kind,discount));
      });
      if(affordable.length)return affordable[0];
    }
    return rankedStudyBuilds[0] || null;`);
 return source;
});}
function run(factory,task){
 const random=seeded(task.seed),homes=[],initialYards=Array(4).fill(null),snapshots=[],events=[];let e,lastEnd=null,setupDecks;
 const inward=['inward-yard','inward-relative-paths','inward-affordable','all-policy'].includes(task.variant);
 const desiredYard=id=>task.variant==='yard-direction'?homes[id].coords[task.parameter+1]:inward?homes[id].coords.slice(1).sort((a,b)=>distance(a)-distance(b))[0]:null;
 const metric=(s)=>({round:s.round,players:s.players.map((p,id)=>{
  const owned=Object.values(s.planets).filter(p=>p.owner===id),colonies=owned.filter(p=>p.hasColony).length;
  const ships={settler:0,explorer:0,fleet:0};for(const g of Object.values(s.fleets))for(const k in ships)ships[k]+=g[id]?.[k]||0;
  return {seat:id,home:homes[id].physical,prestige:e.calculatePrestige(id),colonies,yards:owned.filter(p=>p.upgrade==='starbase').length,harvesters:owned.filter(p=>p.upgrade==='harvester').length,relics:p.relicsExcavated,bought:p.cardsPurchased,resources:{...p.resources},ships};
 })});
 factory({headless:true,random,firstPlayer:task.firstPlayer??0,capture:x=>e=x,
  preferAffordableBuild:['affordable-build','inward-affordable','relative-affordable','all-policy'].includes(task.variant),
  relativeNeighbors:['relative-paths','inward-relative-paths','relative-affordable','all-policy'].includes(task.variant)?(coord,id,neighbors)=>{
    const physical=homes[id].physical;
    const transform=([a,b])=>physical===0?[a,b]:physical===1?[b,a]:physical===2?[-a,-b]:[-b,-a];
    const ranks=new Map(DIRS.map(transform).map(([a,b],i)=>[a+','+b,i]));
    const [q,r]=coord.split(',').map(Number);
    return neighbors.slice().sort((a,b)=>{const[aq,ar]=a.split(',').map(Number),[bq,br]=b.split(',').map(Number);return ranks.get((aq-q)+','+(ar-r))-ranks.get((bq-q)+','+(br-r));});
  }:null,
  setupState:s=>{
   const shift=task.variant==='owner-rotation'?task.parameter:0;
   if(shift)for(const p of Object.values(s.planets))for(const key of ['owner','originalFounder','occupiedBy'])if(p[key]!==null&&p[key]!==undefined)p[key]=(p[key]+shift)%4;
   for(let physical=0;physical<4;physical++){const cluster=s.clusters[physical],owner=s.planets[cluster.center].owner;homes[owner]={physical,center:cluster.center,coords:cluster.coords};}
   const decks=s.players.map(p=>p.deck);
   if(task.variant==='deck-rotation')s.players.forEach((p,i)=>p.deck=decks[(i+task.parameter)%4]);
   if(task.variant==='equal-starters'){const keys=decks[0].map(c=>c.key);s.players.forEach(p=>p.deck.forEach((c,i)=>c.key=keys[i]));}
   if(task.variant==='equal-home-resources')for(const home of homes)home.coords.forEach((coord,i)=>s.planets[coord].type=['matter','energy','biomass','data','matter','energy','data'][i]);
   setupDecks=s.players.map(p=>p.deck.map(c=>c.key));
   s.players.forEach(p=>p.strategy=task.strategy);
  },
  preferInitialYard:(id,coord)=>{
   if(initialYards[id])return false;
   return coord===desiredYard(id);
  },
  onStructure:(s,id,coord,kind,improving)=>{if(kind==='starbase'&&!initialYards[id]){const target=desiredYard(id);if(target && coord!==target)throw Error('Shipyard intervention failed: '+coord+' vs '+target);initialYards[id]={round:s.round,coord,resource:s.planets[coord].type,home:homes[id].physical,homeDistance:distance(coord,homes[id].center)};}},
  onRoundEnd:()=>{lastEnd=metric(e.state);if([1,3,5,7,10,15,20,30,40].includes(e.state.round))snapshots.push(lastEnd);},
  onEvent:(round,text)=>{if(task.detail)events.push({round,text});}
 });
 let steps=0,unchanged=0,stalled=false;
 while(e.state.winner===null && e.state.round<=160 && steps<50000){
  const before=JSON.stringify(e.state),calls=random.calls();
  if(e.state.pendingCombat){const id=e.combatActor();if(!e.applyCombatAction(id,e.chooseCombatAction(e.combatView(id),e.combatActions(id))))throw Error('Combat failed');}
  else if(e.overflowPlayer()>=0)e.trimResourcesToCapacity(e.overflowPlayer());
  else if(e.state.phase==='operations')e.runAiOperation();else if(e.state.phase==='buy')e.runAiBuy();else throw Error('Invalid phase');
  steps++;unchanged=before===JSON.stringify(e.state)&&calls===random.calls()?unchanged+1:0;
  if(unchanged===3){stalled=true;break;}
 }
 const final=e.state.winner!==null?metric(e.state):lastEnd||metric(e.state);
 return {...task,status:e.state.winner!==null?'finished':stalled?'stalled':'round_limit',winner:e.state.winner,winnerHome:e.state.winner===null?null:homes[e.state.winner].physical,round:final.round,steps,initialYards,setupDecks,snapshots,players:final.players,events:task.detail?events:undefined};
}
function distance(key,to='0,0'){const[a,b]=key.split(',').map(Number),[c,d]=to.split(',').map(Number);return Math.max(Math.abs(a-c),Math.abs(b-d),Math.abs(a+b-c-d));}
if(!isMainThread&&workerData?.runner==='seat-study'){
 const f=factory();parentPort.on('message',task=>{try{parentPort.postMessage({result:run(f,task)});}catch(error){parentPort.postMessage({error:error.stack,task});}});
}else if(isMainThread&&require.main===module){
 const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i<0?d:process.argv[i+1];};
 const seeds=+arg('seeds',16),offset=+arg('offset',0),workers=+arg('workers',4),suite=arg('suite','screen'),output=path.resolve(arg('output',path.join(__dirname,'seat-screen.jsonl'))),tasks=[];let id=0;
 const variants=suite==='screen'?[['baseline',0],...[1,2,3].map(x=>['owner-rotation',x]),...[1,2,3].map(x=>['deck-rotation',x]),['equal-starters',0],['equal-home-resources',0],['inward-yard',0],...[1,2,3,4,5].map(x=>['yard-direction',x])]:suite==='followup'?[['inward-yard',0],...[1,2,3,4,5].map(x=>['yard-direction',x]),['relative-paths',0],['inward-relative-paths',0],['affordable-build',0],['inward-affordable',0],['all-policy',0]]:suite==='factorial'?[['baseline',0],['inward-yard',0],['relative-paths',0],['affordable-build',0],['inward-relative-paths',0],['inward-affordable',0],['relative-affordable',0],['all-policy',0]]:suite==='confirm'?[['baseline',0],['equal-home-resources',0],['inward-yard',0]]:[['baseline',0]];
 for(let n=0;n<seeds;n++)for(const strategy of ['military','economy','expansion'])for(const [variant,parameter]of variants)tasks.push({id:id++,block:n+offset,seed:20261111+(n+offset)*7919,strategy,variant,parameter,detail:n===0&&strategy==='economy'&&['baseline','inward-yard','equal-home-resources'].includes(variant)});
 fs.writeFileSync(output,'');fs.writeFileSync(output+'.meta.json',JSON.stringify({sourceCommit:'30ac7a94133b8d493c4856f95999eda255405dc8',engineSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,'prototypes/galactic-reach/app.js'))).digest('hex'),suite,seeds,offset,variants,games:tasks.length,notes:['All profiles homogeneous; the legal-move safeguard from the balance study remains.','Ownership rotations remap initial home owners/founders while keeping player IDs, decks and initial actor fixed.','Starter rotations move the initial shuffled six-card decks between identities before any draw.','Home palette intervention changes only home resource types; geometry and AI are unchanged.','Shipyard interventions change only the first successful Shipyard preference, not costs or subsequent building priorities.','Every intervention shares map seed and RNG initialization with its baseline.']},null,2));
 let next=0,done=0,errors=0;const start=Date.now();
 for(let i=0;i<Math.min(workers,tasks.length);i++){
  const w=new Worker(__filename,{workerData:{runner:'seat-study'}});
  w.on('message',m=>{done++;if(m.error)errors++;fs.appendFileSync(output,JSON.stringify(m.result||m)+'\n');if(done%45===0||done===tasks.length)console.log(JSON.stringify({done,total:tasks.length,errors,seconds:Math.round((Date.now()-start)/1000)}));if(next<tasks.length)w.postMessage(tasks[next++]);else w.terminate();});w.on('error',e=>{console.error(e);process.exitCode=1;});w.postMessage(tasks[next++]);
 }
}
module.exports={run,factory};
