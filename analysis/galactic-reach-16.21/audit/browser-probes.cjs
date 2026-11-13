const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('/private/tmp/drawing-board-compact-frontier/prototypes/galactic-reach/app.js','utf8');
const boot=source.indexOf('\n  if (headless) {\n    state = newState();');
function engine(){let seed=1729,calls=0;const c=vm.createContext({console});vm.runInContext(source.slice(0,boot)+`\nrender=()=>{};saveGame=()=>{};captureHumanTurn=()=>{};completeHumanTurn=()=>{};scheduleAiTurn=()=>{};showMessage=()=>{};toast=()=>{};return{get state(){return state},set state(s){state=s},newState,runAiOperation,chooseAiMove,chooseAiBuild,movementRange,fleetGroup,reachableFrom,performMoveOrder,constructAt,canAfford,cardResources,conversionGain,aiUseResources,resolveHumanSpecial,ALL_CARDS};}\n`,c);const e=c.createGalacticReach({headless:true,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});e.state=e.newState();e.state.phase='operations';e.state.activePlayer=1;e.state.turnStage='ai';e.state.players.forEach(p=>{p.hand=[];p.resources={matter:0,energy:0,biomass:0,data:0};});return{e,calls:()=>calls};}
function planet(q,r,extra={}){return{q,r,cluster:0,type:'matter',owner:null,occupiedBy:null,hasColony:false,upgrade:null,upgradeLevel:0,special:null,relicClaimed:false,...extra};}
const result={};
for(const kind of ['capacity','pathfinder']){
 const{e,calls}=engine(),s=e.state,p=s.players[1];p.strategy=kind==='capacity'?'expansion':'military';p.hand=[{id:'move-probe',key:kind==='capacity'?'move':'pathfinderNetwork'}];
 if(kind==='capacity'){s.planets={'2,0':planet(2,0)};s.clusters=[{id:0,center:'2,0',coords:['2,0'],revealedBy:[0,1,2,3],scannedBy:[]}];s.fleets={'0,0':{1:{settler:1,explorer:0,fleet:0}},'1,0':{1:{settler:0,explorer:0,fleet:5}}};}
 else{s.planets={'1,0':planet(1,0,{owner:0,hasColony:true})};s.clusters=[{id:0,center:'1,0',coords:['1,0'],revealedBy:[0,1,2,3],scannedBy:[]}];s.fleets={'0,0':{1:{settler:0,explorer:0,fleet:1}}};}
 const move=e.chooseAiMove(1,p.hand[0]),moving=e.fleetGroup(s.fleets[move.source][1],move.moveGroup),legal=e.reachableFrom(move.source,1,e.movementRange(moving,p.hand[0]),p.hand[0].key==='pathfinderNetwork',moving);
 const before=JSON.stringify(s),rng=calls();for(let n=0;n<3;n++)e.runAiOperation();result[kind]={chosenMove:move,chosenDestinationLegal:legal.includes(move.destination),unchangedAfter3Steps:JSON.stringify(s)===before,rngUnchanged:calls()===rng,round:s.round,activePlayer:s.activePlayer,hand:p.hand};
}
{
 const {e}=engine(),s=e.state,p=s.players[1];p.strategy='economy';p.hand=[{id:'construct-probe',key:'construct'}];p.resources={matter:1,energy:1,biomass:1,data:0};const center=s.clusters[1].center;s.planets[center].owner=1;s.players[0].resources={matter:0,energy:0,biomass:0,data:0};
 const best=e.chooseAiBuild(1),affordableHarvester=s.clusters[1].coords.find(coord=>e.constructAt(1,coord,'harvester',null,true));e.runAiOperation();result.unaffordableBuild={chosen:best,affordableHarvester,passed:p.passed,remainingConstruct:p.hand.some(c=>c.id==='construct-probe')};
}
{
 const{e}=engine(),p=e.state.players[1];p.hand=[{key:'tradeConsortium',id:'wildcard'}];const card=p.hand[0];e.aiUseResources(p,'other',{data:2});result.wildcardConversion={printedDefault:e.conversionGain(card),browserAiReceived:p.resources.data,discard:p.discard.some(c=>c.id==='wildcard')};
}
fs.writeFileSync('/private/tmp/galactic-balance-audit/browser-probes.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
