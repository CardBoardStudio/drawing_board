// Exercise real authoritative commands, including stale/forged choices and exhaustion.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const plain = x => JSON.parse(JSON.stringify(x));
function game() {
  const c = vm.createContext({});
  vm.runInContext(read('prototypes/galactic-reach/adapter.js') + read('prototypes/galactic-reach/app.js'), c);
  let e, seed = 1729;
  const factory = c.createGalacticAdapter;
  c.createGalacticAdapter = p => { e = p; return factory(p); };
  const a = c.createGalacticReach({headless:true, random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  return {e, a, c, s:e.state, p:e.state.players[0], freshAdapter:()=>factory(e)};
}
function fixture() {
  const g=game();
  g.coord=Object.keys(g.s.planets).find(k=>g.s.planets[k].special==='relic');
  g.s.clusters[g.s.planets[g.coord].cluster].scannedBy=[0]; // Excavation fixture begins after Probe.
  g.p.hand=[{key:'excavate',id:'dig'}];
  g.p.resources={matter:1,energy:1,biomass:0,data:2};
  g.s.fleets[g.coord]={0:{explorer:1}};
  return g;
}
{
  const {e,a,s}=game();
  assert.equal(a.rulesVersion,'galactic-reach/22.27');
  assert.equal(s.clusters.filter(c=>c.kind==='world').length,13);
  assert.equal(s.clusters.filter(c=>c.kind==='moon').length,4);
  assert.equal(Object.values(s.planets).filter(p=>p.special==='relic').length,12);
  assert.equal(s.relicRow.length,3); assert.equal(s.relicDeck.length,9);
  assert(!e.STRUCTURES.research && e.BASIC_CARDS.probe.order==='probe');
  assert(s.players.every(p=>p.relicsExcavated===0));
  for (const seat of [0,1,2,3]) {
    const view=a.observe(seat);
    assert.deepEqual(plain(view.relicRow),plain(s.relicRow),'Shared rewards visible to every seat');
    assert(!('relicDeck' in view),'Deck order stays private');
  }
}
// Each choice slot works, without mutating state during legal-action enumeration.
for (const index of [0,1,2]) {
  const g=fixture(), before=JSON.stringify(g.s), row=plain(g.s.relicRow), prize=row[index], top=g.s.relicDeck.at(-1);
  const legal=g.a.legalActions(0).filter(a=>a.type==='excavate');
  assert.equal(legal.length,3);assert.equal(JSON.stringify(g.s),before);
  const action=legal.find(a=>a.relic===prize.id);
  assert.throws(()=>g.a.applyAction(0,{...action,relic:'hidden-card'}),/Illegal action/);
  assert.equal(JSON.stringify(g.s),before,'Forged rewards do not charge resources or remove relics');
  g.a.applyAction(0,action);
  assert(g.p.discard.some(c=>c.id===prize.id));assert(!g.p.hand.some(c=>c.id===prize.id));
  assert(![...g.p.hand,...g.p.deck,...g.p.discard].some(c=>c.id==='dig'),'Used Excavate is permanently trashed');
  assert.deepEqual(plain(g.p.resources),{matter:0,energy:0,biomass:0,data:0});
  assert(!g.s.fleets[g.coord],'The sole Explorer is consumed and the empty fleet record is removed');
  assert.equal(g.s.planets[g.coord].special,null,'Relic disappears from map');
  assert(!g.s.planets[g.coord].upgrade && !g.s.planets[g.coord].hasColony,'No station or ownership created');
  assert.equal(g.p.relicsExcavated,1);assert.equal(g.e.calculatePrestige(0),2);
  assert.equal(g.s.activePlayer,1,'Excavation uses exactly one action');
  assert.equal(g.s.relicRow[index].id,top.id);assert.equal(g.s.relicDeck.length,8);
  row.forEach((card,i)=>{if(i!==index)assert.equal(g.s.relicRow[i].id,card.id);});
  assert.throws(()=>g.a.applyAction(0,action),/Illegal action/,'Cannot repeat a consumed card');
}
for (const bad of ['missingExplorer','missingCost','wrongSeat','buy','alreadyClaimed','noRow','wrongCard','overflow']) {
  const g=fixture();
  if(bad==='missingExplorer')g.s.fleets={};
  if(bad==='missingCost')g.p.resources.data=1;
  if(bad==='wrongSeat')g.s.activePlayer=1;
  if(bad==='buy')g.s.phase='buy';
  if(bad==='alreadyClaimed')g.s.planets[g.coord].relicClaimed=true;
  if(bad==='noRow')g.s.relicRow=[];
  if(bad==='wrongCard')g.p.hand[0].key='construct';
  if(bad==='overflow')g.p.resources.biomass=10;
  const before=JSON.stringify(g.s);
  assert(!g.e.excavate(0,g.coord,'dig',g.s.relicRow[0]?.id),bad);
  assert.equal(JSON.stringify(g.s),before,`${bad} is atomic`);
}
// Recover every physical site, on worlds and moons, until the finite reward row empties.
{
  const g=game(), sites=Object.keys(g.s.planets).filter(k=>g.s.planets[k].special==='relic'), rewards=new Set();
  for(let n=0;n<sites.length;n++) {
    const coord=sites[n];g.s.clusters[g.s.planets[coord].cluster].scannedBy=[0];g.s.phase='operations';g.s.activePlayer=0;
    g.p.hand=[{key:'excavate',id:`dig-${n}`}];g.p.resources={matter:1,energy:1,biomass:0,data:2};
    g.s.fleets[coord]={0:{explorer:1}};
    const choice=g.s.relicRow[Math.min(n%3,g.s.relicRow.length-1)];rewards.add(choice.key);
    const a=g.freshAdapter(), action=a.legalActions(0).find(a=>a.type==='excavate'&&a.coord===coord&&a.relic===choice.id);
    assert(action);a.applyAction(0,action);
    assert.equal(g.s.relicRow.length,Math.min(3,11-n));
    assert.equal(g.p.relicsExcavated,n+1);
  }
  assert.equal(rewards.size,12);assert.equal(g.s.relicRow.length,0);assert.equal(g.s.relicDeck.length,0);
  assert.equal(Object.values(g.s.planets).filter(p=>p.special==='relic').length,0);
  assert.equal(g.e.calculatePrestige(0),13,'Relic Prestige persists after its reward leaves the hand');
}
// Moons are movement/combat locations, but never construction, colonies, or production.
{
  const g=game(), moon=g.s.clusters.find(c=>c.kind==='moon'), coord=moon.center;
  const [q,r]=coord.split(',').map(Number), source=`${q-1},${r}`;
  g.p.hand=[{key:'move',id:'moon-move'}];g.s.fleets[source]={0:{fleet:1}};
  const move=g.a.legalActions(0).find(a=>a.type==='move'&&a.source===source&&a.destination===coord);
  assert(move);g.a.applyAction(0,move);
  assert(moon.revealedBy.length===4);
  assert.equal(g.a.observe(1).planets[coord].type,'moon');
  assert(!g.e.colonizePlanet(0,coord,{},true));
  assert(!g.e.constructAt(0,coord,'harvester',null,true));
  const before=plain(g.s.players.map(p=>p.resources));
  // Finish the round through ordinary commands; the moon fleet must produce no resource.
  g.s.players.forEach(p=>{p.hand=[];p.deck=[];p.discard=[];});
  for(let n=0;n<8;n++){const a=g.freshAdapter(),seat=a.activeSeat();a.applyAction(seat,a.legalActions(seat).find(x=>x.type===(g.s.phase==='buy'?'finish_buy':'pass')));}
  for(const p of g.s.players){assert.equal(p.resources.matter,before[p.id].matter+1);assert(!('moon' in p.resources));}
}
console.log('Excavation: public three-card choices, exact costs, atomic invalid choices, immediate refill, finite exhaustion, permanent trash/Prestige, consumed Explorers, and non-producing moons passed.');
