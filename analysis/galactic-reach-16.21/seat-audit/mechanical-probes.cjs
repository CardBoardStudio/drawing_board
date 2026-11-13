'use strict';
const fs=require('fs'),vm=require('vm');
const sourcePath='/private/tmp/drawing-board-compact-frontier/prototypes/galactic-reach/app.js';
const source=fs.readFileSync(sourcePath,'utf8'),boot=source.indexOf('\n  if (headless) {\n    state = newState();');
function engine(constant=false){let seed=1729,calls=0;const context=vm.createContext({console});vm.runInContext(source.slice(0,boot)+`\nrender=()=>{};saveGame=()=>{};captureHumanTurn=()=>{};completeHumanTurn=()=>{};scheduleAiTurn=()=>{};showMessage=()=>{};toast=()=>{};return{get state(){return state},set state(s){state=s},newState,chooseAiBuild,chooseAiMove,nearestGoal,pathToCoord,aiUseResources,constructAt,removeHandCard,produceAll,canAfford,bankPlanForCost,homeCoord,hexDistance,DIRECTIONS,HOME_STARTS,ALL_CARDS};}\n`,context);const e=context.createGalacticReach({headless:true,random:()=>{calls++;return constant?0:((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});e.state=e.newState();return{e,calls:()=>calls};}
const copy=o=>JSON.parse(JSON.stringify(o)),resourceKeys=['matter','energy','biomass','data'];
function resourceDelta(a,b){return Object.fromEntries(resourceKeys.map(k=>[k,b[k]-a[k]]));}
function cardLayout(id,c=3,m=2){return [...Array(c).fill('construct'),...Array(m).fill('move')].map((key,i)=>({id:`probe-${id}-${key}-${i}`,key,starter:true}));}
function inward(e,id){return e.state.clusters[id].coords[e.HOME_STARTS[id].inwardSector];}
const out={sourcePath,scope:'Mechanical affordability and ordering probes only. Not whole games: no buy phase, combat, movement or shuffle; each round receives the same five unupgraded starter cards. The opening resource trace has storage raised to 110 to isolate conversion/production from overflow (so it is not a prediction of live opening rounds); overflow above ordinary 10 is recorded. Full-match interventions belong to root.',initialHomes:[],openingTraces:[],symmetricLaunch:[],tieOrder:[],oneProductionAffordability:[],buildEnumeration:[]};
{
 const {e}=engine();
 for(let id=0;id<4;id++){
  const c=e.state.clusters[id],p=e.state.players[id];p.strategy='expansion';
  const yard=e.chooseAiBuild(id);
  out.initialHomes.push({id,center:c.center,resources:c.coords.map(coord=>({coord,type:e.state.planets[coord].type})),firstYard:yard.coord,firstYardType:e.state.planets[yard.coord].type,inwardYard:inward(e,id),inwardType:e.state.planets[inward(e,id)].type});
 }
}
for(const strategy of ['expansion','economy','military'])for(const constructs of [2,3])for(const variant of ['east-first','inward-first'])for(const id of [0,1,2,3]){
 const {e,calls}=engine(),s=e.state,p=s.players[id];p.strategy=strategy;p.storageUpgrades=20;p.resources={matter:0,energy:0,biomass:2,data:0};
 // Other homes remain present, but cannot affect this no-movement/no-trade probe.
 s.players.forEach((x,j)=>{if(j!==id)x.resources={matter:0,energy:0,biomass:0,data:0};});
 const trace={id,strategy,constructs,moves:5-constructs,variant,rounds:[]};let firstYardBuilt=false;
 for(let round=1;round<=5;round++){
  s.round=round;s.phase='operations';s.activePlayer=id;s.turnStage='ai';p.passed=false;p.hand=cardLayout(`${id}-${round}`,constructs,5-constructs);
  const beforeProduction=copy(p.resources);e.produceAll();const row={round,production:resourceDelta(beforeProduction,p.resources),afterProduction:copy(p.resources),attempts:[]};
  while(p.hand.some(c=>c.key==='construct')){
   let build=e.chooseAiBuild(id);if(!build)break;
   if(!firstYardBuilt&&build.kind==='starbase'&&variant==='inward-first')build={...build,coord:inward(e,id)};
   const card=p.hand.find(c=>c.key==='construct'),before=copy(p.resources),handBefore=p.hand.map(c=>c.id),rngBefore=calls();
   e.aiUseResources(p,card.id,build.cost);
   const afterFunding=copy(p.resources),converted=handBefore.filter(cid=>!p.hand.some(c=>c.id===cid)).map(cid=>cid.includes('-construct-')?'construct':'move');
   const built=e.constructAt(id,build.coord,build.kind);
   if(built){e.removeHandCard(p,card.id);if(build.kind==='starbase')firstYardBuilt=true;}
   row.attempts.push({kind:build.kind,coord:build.coord,type:s.planets[build.coord]?.type,score:build.score,before,converted,afterFunding,built,after:copy(p.resources),rngCalls:calls()-rngBefore,overflow:Math.max(0,Object.values(p.resources).reduce((a,b)=>a+b,0)-10)});
   if(!built)break;
  }
  row.endResources=copy(p.resources);row.units=Object.entries(s.fleets).filter(([,g])=>g[id]).map(([coord,g])=>({coord,...g[id]}));trace.rounds.push(row);
 }
 out.openingTraces.push(trace);
}
// One real production/affordability step: capacity 10, no conversion or shuffle.
for(const [checkpoint,stock] of Object.entries({energyStarved:{matter:0,energy:0,biomass:1,data:2},dataStarved:{matter:1,energy:1,biomass:1,data:1},matterStarved:{matter:0,energy:1,biomass:1,data:0}}))for(const id of [0,1,2,3])for(const variant of ['east-first','inward-first']){
 const {e,calls}=engine(),s=e.state,p=s.players[id];p.strategy='expansion';s.phase='operations';s.activePlayer=id;
 const base=e.chooseAiBuild(id),yard=variant==='east-first'?base.coord:inward(e,id);p.resources={matter:2,energy:1,biomass:2,data:1};
 if(!e.constructAt(id,yard,'starbase'))throw Error('funded first yard failed');
 s.players.forEach((x,j)=>x.resources=j===id?copy(stock):{matter:0,energy:0,biomass:0,data:0});
 p.hand=[{id:'reserved-construct',key:'construct',starter:true}];const rngBefore=calls();e.produceAll();
 const chosen=e.chooseAiBuild(id),affordable=Object.fromEntries(['settler','explorer','fleet'].map(kind=>[kind,e.constructAt(id,yard,kind,null,true)]));
 out.oneProductionAffordability.push({checkpoint,id,variant,yard,yardType:s.planets[yard].type,before:stock,after:copy(p.resources),chosen:{kind:chosen.kind,affordable:e.constructAt(id,chosen.coord,chosen.kind,null,true)},affordable,rngCalls:calls()-rngBefore});
}
// Reordering only the object entries changes the equal-score first-yard target.
for(const id of [0,1,2,3]){
 const {e,calls}=engine(),s=e.state,p=s.players[id];p.strategy='expansion';const before=e.chooseAiBuild(id),preferred=inward(e,id),rngBefore=calls();
 s.planets=Object.fromEntries(Object.entries(s.planets).sort(([a],[b])=>(a===preferred?-1:b===preferred?1:0)));
 const after=e.chooseAiBuild(id);out.buildEnumeration.push({id,before,after,types:{before:s.planets[before.coord].type,after:s.planets[after.coord].type},rngCalls:calls()-rngBefore});
}
// Constant RNG takes the generator's validated, centrally symmetric fallback.
for(const id of [0,1,2,3])for(const variant of ['east-first','inward-first'])for(const kind of ['settler','explorer','fleet']){
 const {e}=engine(true),s=e.state,p=s.players[id];p.strategy=kind==='fleet'?'military':'expansion';
 const first=e.chooseAiBuild(id),yard=variant==='east-first'?first.coord:inward(e,id);s.fleets={[yard]:{[id]:{settler:kind==='settler'?1:0,explorer:kind==='explorer'?1:0,fleet:kind==='fleet'?1:0}}};
 const move=e.chooseAiMove(id,{key:'move'}),path=kind==='explorer'?null:e.nearestGoal(yard,id,kind==='fleet');
 const center=s.clusters[id].center;
 out.symmetricLaunch.push({id,variant,kind,home:center,yard,yardType:s.planets[yard].type,move,path,nearestOtherColonyDistance:Math.min(...s.clusters.slice(0,4).filter(c=>c.id!==id).map(c=>e.hexDistance(yard,c.center))),nearestNeutralCenterDistance:Math.min(...s.clusters.slice(4,12).map(c=>e.hexDistance(yard,c.center))),nearestUnknownCluster:s.clusters.filter(c=>!c.revealedBy.includes(id)).map(c=>({center:c.center,distance:e.hexDistance(yard,c.center)})).sort((a,b)=>a.distance-b.distance)[0]});
}
// A two-goal mirrored fixture isolates BFS tie direction from map randomness.
const transform=[([q,r])=>[q,r],([q,r])=>[r,q],([q,r])=>[-q,-r],([q,r])=>[-r,-q]],key=([q,r])=>`${q},${r}`;
for(let id=0;id<4;id++){
 const {e}=engine();const s=e.state,T=transform[id],start=key(T([0,0])),goals=[[2,0],[0,2]].map(T).map(key);
 s.planets={};s.clusters=goals.map((center,i)=>({id:i,center,coords:[center],kind:'world',revealedBy:[0,1,2,3],scannedBy:[]}));
 goals.forEach((coord,i)=>{const [q,r]=coord.split(',').map(Number);s.planets[coord]={q,r,cluster:i,type:'matter',owner:null,occupiedBy:null,hasColony:false,upgrade:null};});
 const original=e.nearestGoal(start,id,false);e.DIRECTIONS.splice(0,6,...e.DIRECTIONS.map(T));const equivariant=e.nearestGoal(start,id,false);
 out.tieOrder.push({id,goals,canonicalPreferred:goals[0],original,equivariant});
}
const assert=require('assert/strict');
assert.deepEqual(out.initialHomes.map(x=>x.firstYardType),['energy','data','matter','data']);
assert(out.initialHomes.every(x=>x.inwardType==='energy'));
assert.deepEqual(out.symmetricLaunch.filter(x=>x.kind==='settler'&&x.variant==='east-first').map(x=>x.nearestNeutralCenterDistance),[4,4,6,6]);
assert(out.symmetricLaunch.filter(x=>x.kind==='settler'&&x.variant==='inward-first').every(x=>x.nearestNeutralCenterDistance===4));
assert.deepEqual(out.oneProductionAffordability.filter(x=>x.checkpoint==='dataStarved'&&x.variant==='east-first').map(x=>x.chosen.affordable),[false,true,false,true]);
assert(out.oneProductionAffordability.every(x=>x.rngCalls===0));
assert(out.buildEnumeration.every(x=>x.rngCalls===0&&x.after.coord===out.initialHomes[x.id].inwardYard));
assert.deepEqual(out.tieOrder.map(x=>x.original.at(-1)===x.canonicalPreferred),[true,false,false,true]);
assert(out.tieOrder.every(x=>x.equivariant.at(-1)===x.canonicalPreferred));
out.sourceCommit='30ac7a94133b8d493c4856f95999eda255405dc8';
out.sourceSha256=require('crypto').createHash('sha256').update(source).digest('hex');
out.assertions='All mechanical invariants passed';
fs.writeFileSync('/private/tmp/galactic-seat-audit/mechanical-probes.json',JSON.stringify(out,null,2));
console.log(`PASS: ${out.initialHomes.length} homes, ${out.openingTraces.length} controlled traces, ${out.oneProductionAffordability.length} real-capacity affordability checkpoints, ${out.symmetricLaunch.length} launch probes, ${out.tieOrder.length} reflected BFS fixtures; no production changes.`);
