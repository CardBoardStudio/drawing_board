const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const plain = x => JSON.parse(JSON.stringify(x));
function game(version = null) {
  const base = version ? `crates/galactic-reach/rules/v${version}-` : 'prototypes/galactic-reach/';
  const c = vm.createContext({});
  vm.runInContext(['adapter.js','app.js'].map(n=>fs.readFileSync(path.join(root,base+n),'utf8')).join('\n'),c);
  let e, seed=17;const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};
  const a=c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
  return {e,a,s:e.state,p:e.state.players[0]};
}
function effect(key) {
  const g=game();g.p.hand=[{key,id:'relic-order'}];g.p.resources={matter:0,energy:0,biomass:0,data:0};g.p.storageUpgrades=10;
  g.p.deck=[{key:'move',id:'draw1'},{key:'construct',id:'draw2'},{key:'move',id:'draw3'}];
  return g;
}
function special(g) {const action=g.a.legalActions(0).find(a=>a.type==='special');assert(action);g.a.applyAction(0,action);assert(g.p.discard.some(c=>c.id==='relic-order'));assert.equal(g.s.activePlayer,1);}
{
  const {e,a,s}=game();assert.equal(a.rulesVersion,'galactic-reach/16.21');assert.deepEqual(plain(s.fleets),{});
  for(const p of s.players) {
    const cards=[...p.deck,...p.hand,...p.discard];assert.equal(cards.length,6);
    assert.equal(cards.filter(c=>c.key==='move').length,3);assert.equal(cards.filter(c=>c.key==='construct').length,3);
    assert(cards.every(c=>c.starter));assert.deepEqual(plain(p.resources),{matter:1,energy:0,biomass:2,data:0});
    assert(!('relics' in p)&&!('relicRecoveries' in p));
  }
  assert.equal(s.relicDeck.length,9);assert.equal(new Set([...s.relicDeck,...s.relicRow].map(c=>c.key)).size,12);
  const cards=Object.values(e.RELIC_CARDS);assert.equal(cards.length,12);
  for(const type of ['Exploration','Settlement','Military'])assert.equal(cards.filter(c=>c.affinity===type).length,4);
  assert(s.advancedDeck.every(c=>!e.RELIC_CARDS[c.key])&&s.market.every(c=>!e.RELIC_CARDS[c.key]));
}
{
  const {e,a,s,p}=game(),home=s.clusters[0].center,yard=s.clusters[0].coords[1];p.storageUpgrades=20;p.resources={matter:20,energy:20,biomass:20,data:20};
  assert(!e.buildShip(0,home,'explorer'),'Colony cannot commission Explorers');
  s.planets[yard].owner=0;s.planets[yard].upgrade='harvester';s.planets[yard].upgradeLevel=2;
  assert(!e.buildShip(0,yard,'explorer'),'Level-II buildings cannot commission Explorers');
  s.planets[yard].upgrade='starbase';
  const count=p.discard.length;assert(e.buildShip(0,yard,'settler'));assert.equal(p.discard.at(-1).key,'colonize');assert(!p.discard.at(-1).starter);
  const hand=p.hand.length;assert(e.buildShip(0,yard,'explorer'));assert.equal(p.discard.at(-1).key,'excavate');assert.equal(p.hand.length,hand);assert.equal(p.discard.length,count+2);
  assert(e.buildShip(0,yard,'fleet'));assert.equal(p.discard.length,count+2,'Fleets grant no order card');assert.equal(p.cardsPurchased,0);
  const before=JSON.stringify(s);assert(e.buildShip(0,yard,'settler',0,true));assert.equal(JSON.stringify(s),before,'Legality checks do not grant cards');
  s.phase='buy';assert(!e.buyCard(0,'basic','colonize'));assert(!e.buyCard(0,'basic','excavate'));
  assert(!a.legalActions(0).some(x=>x.type==='buy'&&['colonize','excavate'].includes(x.key)));
  assert(!a.legalActions(0).some(x=>x.type==='exchange_relic'));
}
{
  // Retained 12.17 station semantics are exercised only on the immutable engine.
  const {e,a,s,p}=game(12),coord=Object.keys(s.planets).find(k=>s.planets[k].special==='relic');
  p.hand=[{key:'construct',id:'station-order',starter:true,upgraded:true}];p.resources={matter:1,energy:1,biomass:0,data:1};
  s.fleets[coord]={0:{settler:0,explorer:1,fleet:0}};
  const prize=s.relicDeck.at(-1),count=s.relicDeck.length,before=JSON.stringify(s);
  const action=a.legalActions(0).find(x=>x.type==='establish_station'&&x.coord===coord&&x.discountResource==='data');assert(action);
  assert.equal(JSON.stringify(s),before);a.applyAction(0,action);
  assert.equal(s.planets[coord].researchStationOwner,0);assert.equal(s.planets[coord].owner,null);assert(!s.fleets[coord]?.[0]);
  assert(p.hand.some(c=>c.id===prize.id));assert.equal(s.relicDeck.length,count-1);assert.equal(e.researchStationCount(0),1);assert.equal(e.calculatePrestige(0),2);
  assert(!p.discard.some(c=>c.id===prize.id));assert(!a.observe(1).players[0].hand);
  assert(!s.log.some(line=>line.includes(e.ALL_CARDS[prize.key].name)),'Public logs keep the drawn card private');
  p.resources={matter:10,energy:10,biomass:0,data:10};s.fleets[coord]={0:{explorer:1}};
  const after=JSON.stringify(s);assert(!e.buildResearchStation(0,coord));assert.equal(JSON.stringify(s),after);
}
{
  const g=effect('voidglassAstrolabe'),known=g.s.clusters.filter(c=>g.e.clusterKnown(c,0)).length;
  special(g);assert.equal(g.s.clusters.filter(c=>g.e.clusterKnown(c,0)).length,known+2);
  assert(g.s.clusters.filter(c=>g.e.clusterKnown(c,0)).every(c=>c.revealedBy.length===4));
}
{
  const g=effect('firstDawnEchoes');special(g);assert.equal(g.p.hand.length,3);
}
{
  const g=effect('omniscientChorus'),known=g.s.clusters.filter(c=>g.e.clusterKnown(c,0)).length;special(g);
  const worlds=g.s.clusters.filter(c=>g.e.relicCoordInCluster(c));assert(worlds.every(c=>c.scannedBy.includes(0)));
  assert(worlds.every(c=>!c.scannedBy.includes(1)));assert.equal(g.s.clusters.filter(c=>g.e.clusterKnown(c,0)).length,known);assert.equal(g.p.hand.length,1);
}
{
  const g=effect('precursorMatterLoom');special(g);assert.deepEqual(plain(g.p.resources),{matter:4,energy:0,biomass:2,data:0});
}
{
  const g=effect('worldweaverSpore'),world=g.s.clusters[0];g.s.planets[world.coords[1]].owner=0;
  special(g);assert(!('rich' in g.s.planets[world.center])&&!('rich' in g.s.planets[world.coords[1]]));assert.equal(g.e.totalResources(g.p),2);
}
{
  const g=effect('cradleOfLostSuns'),capacity=g.e.playerCapacity(0);special(g);assert.equal(g.e.playerCapacity(0),capacity+5);assert.equal(g.p.resources.biomass,2);assert.equal(g.p.hand.length,1);
}
for(const capture of [false,true]) {
  const g=effect('genesisSeedVault'),world=g.s.clusters[capture?1:4],coord=world.center;
  g.s.fleets[coord]={0:{settler:1,explorer:0,fleet:0}};if(capture)g.s.planets[coord].occupiedBy=0;
  const action=g.a.legalActions(0).find(x=>x.type==='colonize'&&x.coord===coord);assert(action);g.a.applyAction(0,action);
  assert.equal(g.s.planets[coord].owner,0);assert.equal(g.s.fleets[coord][0].settler,1);assert.equal(g.p.resources.biomass,0);assert.equal(g.p.resources.matter,2);
}
{
  const g=effect('phaseShearDrive');g.s.planets={};g.s.fleets={'0,0':{0:{explorer:1}}};
  assert.equal(g.e.movementRange({explorer:1},g.p.hand[0]),6);assert(g.a.legalActions(0).some(x=>x.type==='move'&&x.destination==='6,0'));
  assert.equal(g.e.movementRange({fleet:1},{key:'obeliskOfAnnihilation'}),4);
}
function battle(key,units=1,tag=null) {
  const g=game(14);g.s.planets={};g.s.fleets={'0,0':{0:{settler:0,explorer:0,fleet:units}},'1,0':{1:{settler:0,explorer:0,fleet:units}}};
  g.p.hand=key?[{key,id:'reaction'}]:[];g.s.players[1].hand=[];g.p.resources={matter:0,energy:0,biomass:0,data:0};
  for(const p of g.s.players){p.militaryDeck=['concentratedFire','concentratedFire','concentratedFire'];p.militaryDiscard=[];}
  assert(g.e.executeMove(0,'0,0','1,0',{moveGroup:'ships',tag}));return g;
}
assert.match(battle(null).s.lastCombat.summary[0],/\(2 hits through\)/);
assert.match(battle('warSongOfHollowStars').s.lastCombat.summary[0],/\(5 hits through\)/);
assert.match(battle('aegisOfSilentArchitects').s.lastCombat.summary[0],/\(0 hits through\)/);
assert.match(battle(null,1,'alienAssault').s.lastCombat.summary[0],/\(4 hits through\)/);
assert.deepEqual(plain(battle('naniteOssuary',5,'overdrive').p.resources),{matter:6,energy:0,biomass:0,data:2});
{
  const {e,a,s,p}=game(10);assert.equal(a.rulesVersion,'galactic-reach/10.15');assert.equal(s.fleets[s.clusters[0].center][0].settler,1);assert(e.recoverRelic&&e.exchangeRelic);assert('relicRecoveries' in p);
}
const book=fs.readFileSync(path.join(root,'prototypes/galactic-reach/rulebook.html'),'utf8');
for(const [key,c] of Object.entries(game().e.RELIC_CARDS)){assert(book.includes(`data-card="${key}"`));assert(book.includes(c.name));}
console.log('Alien relics: Colony-only six-card start, Shipyard-only Explorers, unit bundles, atomic private station draws, all 12 relic effects including real combat, no old exchanges, and archived 10.15 passed.');
