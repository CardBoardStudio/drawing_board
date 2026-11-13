// Local shorter-game rules, seat-neutral browser heuristics, and immutable 16.21 routing.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
const source=read('prototypes/galactic-reach/app.js'),boot=source.indexOf('\n  if (headless) {\n    state = newState();');
function game(){let seed=1729,calls=0;const c=vm.createContext({console});vm.runInContext(source.slice(0,boot)+`\nrender=()=>{};saveGame=()=>{};captureHumanTurn=()=>{};completeHumanTurn=()=>{};scheduleAiTurn=()=>{};showMessage=()=>{};toast=()=>{};return{get state(){return state},set state(s){state=s},newState,chooseAiBuild,chooseAiMove,aiHomeCluster,aiInitialShipyard,aiMovementNeighbors,nearestGoal,pathToCoord,constructAt,constructionCost,runAiOperation,reachableFrom,movementRange,fleetGroup,finishRound,calculatePrestige,SHIP_STATS,STRUCTURES,EXCAVATION_COST,ALL_CARDS,VICTORY_TARGET,SAVE_KEY,TURN_HISTORY_KEY};}\n`,c);const e=c.createGalacticReach({headless:true,random:()=>{calls++;return(seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32;}});e.state=e.newState();e.state.phase='operations';e.state.turnStage='ai';e.state.players.forEach(p=>{p.hand=[];p.resources={matter:0,energy:0,biomass:0,data:0};});return{e,s:e.state,calls:()=>calls};}
const resource={matter:2,energy:1,biomass:1,data:1},yardFor=['-8,0','0,-8','8,0','0,8'];
for(let id=0;id<4;id++){
 const{e,s,calls}=game(),p=s.players[id];s.round=3;p.strategy='expansion';p.resources={...resource};p.hand=[{key:'construct',id:'build'}];
 const before=JSON.stringify(s),rng=calls();for(let n=0;n<10;n++){const b=e.chooseAiBuild(id);assert.equal(b.kind,'starbase');assert.equal(b.coord,yardFor[id]);assert.equal(s.planets[b.coord].type,'energy');e.aiMovementNeighbors('0,0',id);}
 assert.equal(JSON.stringify(s),before);assert.equal(calls(),rng,'Planning consumes neither state nor RNG');
 assert(e.constructAt(id,yardFor[id],'starbase'));assert.equal(p.initialShipyardCoord,yardFor[id]);
 const saved=JSON.stringify(s);e.state=JSON.parse(saved);assert.equal(e.state.players[id].initialShipyardCoord,yardFor[id]);
}
// The first-yard marker records the first actual construction, including a human choice,
// and does not reset when a yard is lost or occupied.
{
 const{e,s}=game(),p=s.players[2],east=s.clusters[2].coords[1];p.resources={...resource};assert(e.constructAt(2,east,'starbase'));assert.equal(p.initialShipyardCoord,east);
 s.planets[east].owner=1;p.strategy='expansion';assert.notEqual(e.chooseAiBuild(2).coord,yardFor[2],'No second first-yard preference after conquest');assert.equal(p.initialShipyardCoord,east);
}
// Physical home, not identity, controls reflected path order and initial yard.
{
 const{e,s}=game();for(const p of Object.values(s.planets))for(const key of ['owner','originalFounder','occupiedBy'])if(p[key]!==null&&p[key]!==undefined)p[key]=(p[key]+1)%4;
 for(let physical=0;physical<4;physical++){const id=(physical+1)%4;assert.equal(e.aiHomeCluster(id).id,physical);assert.equal(e.aiInitialShipyard(id),yardFor[physical]);}
}
const transforms=[([q,r])=>[q,r],([q,r])=>[r,q],([q,r])=>[-q,-r],([q,r])=>[-r,-q]],key=([q,r])=>`${q},${r}`;
for(let id=0;id<4;id++){
 const{e,s}=game(),T=transforms[id],goals=[[2,0],[0,2]].map(T).map(key);
 for(const coord of goals){const i=s.clusters.length,[q,r]=coord.split(',').map(Number);s.clusters.push({id:i,center:coord,coords:[coord],kind:'world',revealedBy:[],scannedBy:[]});s.planets[coord]={q,r,cluster:i,type:'matter',owner:null,occupiedBy:null,hasColony:false,upgrade:null};}
 const before=JSON.stringify(s);assert.equal(e.nearestGoal('0,0',id,false).at(-1),goals[0]);assert.equal(JSON.stringify(s),before);
 const dirs=e.aiMovementNeighbors('0,0',id);assert.equal(dirs[0],key(T([1,0])));
}
// Before bootstrap, preserve the preferred Shipyard instead of filling all six slots
// with cheaper Harvesters. Afterward preserve scores while selecting affordable builds.
{
 const{e,s}=game(),p=s.players[1];s.round=3;p.strategy='expansion';p.hand=[{key:'construct',id:'order'}];p.resources={matter:1,energy:1,biomass:1,data:0};
 assert.equal(e.chooseAiBuild(1).kind,'starbase');
 p.resources={...resource};assert(e.constructAt(1,yardFor[1],'starbase'));
 p.resources={matter:1,energy:1,biomass:0,data:0};assert.equal(e.chooseAiBuild(1).kind,'settler','Affordable Settler replaces unfundable Explorer');
 p.resources={matter:0,energy:1,biomass:0,data:0};p.hand[0].upgraded=true;const b=e.chooseAiBuild(1);assert.equal(b.kind,'settler','Fallback uses the same selected-resource discount as Construct II');
 assert(e.constructAt(1,b.coord,b.kind,'matter',true));
 p.hand[0].upgraded=false;p.resources={matter:0,energy:0,biomass:0,data:0};assert.equal(e.chooseAiBuild(1).kind,'settler','If nothing is affordable retain the scoring plan instead of discretionary infrastructure');
 s.planets[yardFor[1]].occupiedBy=2;p.resources={matter:1,energy:1,biomass:1,data:0};assert.equal(e.chooseAiBuild(1).kind,'starbase','Occupied yard does not activate fallback');
}
function target(s,coord){const i=s.clusters.length,[q,r]=coord.split(',').map(Number);s.clusters.push({id:i,center:coord,coords:[coord],kind:'world',revealedBy:[],scannedBy:[]});s.planets[coord]={q,r,cluster:i,type:'matter',owner:null,occupiedBy:null,hasColony:false,upgrade:null};}
{
 const{e,s}=game(),p=s.players[1];p.strategy='expansion';p.hand=[{id:'move',key:'move'}];s.activePlayer=1;
 s.planets['0,0'].owner=1;s.planets['0,0'].hasColony=true;
 target(s,'2,0');s.fleets={'0,0':{1:{settler:1,explorer:0,fleet:0}},'1,0':{1:{settler:0,explorer:0,fleet:5}}};
 const move=e.chooseAiMove(1,p.hand[0]);assert(move);const moving=e.fleetGroup(s.fleets[move.source][1],move.moveGroup);
 assert(e.reachableFrom(move.source,1,e.movementRange(moving,p.hand[0]),false,moving).includes(move.destination),'Full friendly hex cannot become an illegal preferred destination');
 const before=JSON.stringify(s);for(let n=0;n<3&&s.phase==='operations'&&s.activePlayer===1;n++)e.runAiOperation();assert.notEqual(JSON.stringify(s),before,'Capacity blocker cannot stall operations');
}
{
 const{e,s}=game(),p=s.players[1];p.strategy='military';p.hand=[{id:'pathfinder',key:'pathfinderNetwork'}];s.activePlayer=1;
 s.planets['1,0']={q:1,r:0,cluster:0,type:'matter',owner:0,occupiedBy:null,hasColony:true,upgrade:null};s.fleets={'0,0':{1:{settler:0,explorer:0,fleet:1}}};
 assert.equal(e.chooseAiMove(1,p.hand[0]),null,'Pathfinder cannot choose its forbidden attack');const before=JSON.stringify(s);e.runAiOperation();assert.notEqual(JSON.stringify(s),before);assert(p.discard.some(c=>c.id==='pathfinder'));assert.equal(p.resources.energy,1);assert.equal(p.resources.biomass,1,'An unavailable order may be converted normally instead; no illegal Move was spent');
}
for(const points of [19,20,21]){const{e,s}=game();s.players[0].combatVictories=points-3;assert.equal(e.calculatePrestige(0),points);e.finishRound();assert.equal(s.winner,points>=20?0:null);}
{
 const{e,s}=game();assert.equal(e.VICTORY_TARGET,20);assert.equal(s.version,24);assert.equal(s.rulesRevision,29);assert.equal(e.SAVE_KEY,'galactic-reach-save-v24');assert.equal(e.TURN_HISTORY_KEY,'galactic-reach-turn-history-v24');
 assert.deepEqual(plain(e.STRUCTURES.starbase.cost),{matter:2,energy:1,biomass:1,data:1});assert.deepEqual(plain(e.EXCAVATION_COST),{matter:1,energy:1,data:2});
 assert.deepEqual(plain(e.SHIP_STATS.explorer.cost),{energy:1,data:2});assert.deepEqual(plain(e.SHIP_STATS.settler.cost),{matter:1,energy:1});assert.deepEqual(plain(e.SHIP_STATS.fleet.cost),{matter:2,energy:1,biomass:1});
}
const hashes={"app.js": "c36b02100e148189bc5c8f542b1c29814e873f5b781ecb1071e7a51950f60ae2", "adapter.js": "6b986e56978ce183b6386cbd5992b499575c4b2e26ce1f4dc1425f656ee759c4", "index.html": "d24e4726f9126a3d04142d43c901e3fa68a54ecdef5778659eee1484dfee4405", "styles.css": "f4ef51fc6b513bc66de56a12557430d8c4538dc16cdc3882150935da4220af0c", "rulebook.html": "b3cae049588e59b049a820503514243c1f52fededa79dc12b6d496ecd666856d", "rulebook.css": "c89d7ff15fc902e2dda07d2ef54213e9ec09796a736c596dbc411c12fa5c1e5b", "replay.js": "41f5753456c68842db80977a12496761d16927847a14554f75e54214b53457d9"};
for(const [asset,hash] of Object.entries(hashes))assert.equal(crypto.createHash('sha256').update(read(`crates/galactic-reach/rules/v16-${asset}`)).digest('hex'),hash,`16.21 ${asset} remains immutable`);
assert.equal(crypto.createHash('sha256').update(read('crates/galactic-reach/src/legacy_v12.rs').split('#[derive(Clone, Copy, Debug)]')[1].trim()).digest('hex'),'ceeaf920a83ce9efda451179de795cbf116fe074050334fc6c769e89725019ad','Archived policy12 stays byte-for-byte identical');
const c=vm.createContext({});vm.runInContext(read('crates/galactic-reach/rules/v16-adapter.js')+read('crates/galactic-reach/rules/v16-app.js'),c);const a=c.createGalacticReach({headless:true,random:()=>0});assert.equal(a.rulesVersion,'galactic-reach/16.21');
assert(read('prototypes/galactic-reach/table.js').includes("'galactic-reach/16.21':{format:16,path:'/galactic-reach/rules/16.21/'}"));assert(read('prototypes/lab/replay.js').includes("'galactic-reach/16.21':'/galactic-reach/rules/16.21/'"));assert(read('scripts/build-web.sh').includes('dist/galactic-reach/rules/16.21'));
console.log('Ten Prestige: 10-point victory, physical-home-aware inward launch/path ties, pure affordable build selection/discounts, capacity/Pathfinder safeguards, unchanged costs, save isolation and immutable16.21/policy12 passed.');
