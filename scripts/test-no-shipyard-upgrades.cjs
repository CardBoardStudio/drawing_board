const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
function game(){
 const c=vm.createContext({});let e,extra,seed=1729;
 const source=fs.readFileSync(path.join(root,'prototypes/galactic-reach/app.js'),'utf8').replace('    return createGalacticAdapter({','    options.testCapture({chooseAiBuild,combatPieces,buildingLabel});\n    return createGalacticAdapter({');
 vm.runInContext(fs.readFileSync(path.join(root,'prototypes/galactic-reach/adapter.js'),'utf8')+source,c);
 const real=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return real(p);};
 c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),testCapture:p=>extra=p});
 const s=e.state,p=s.players[0];p.storageUpgrades=100;p.resources={matter:100,energy:100,biomass:100,data:100};p.hand=[{key:'construct',id:'construct',starter:true,upgraded:false}];
 return{e,s,p,...extra,adapter:()=>real(e)};
}
for(const upgraded of [false,true]){
 const g=game(),coord=g.s.clusters[0].coords[1];
 assert(g.e.constructAt(0,coord,'starbase'));assert.equal(g.s.planets[coord].upgradeLevel,1);
 assert.equal(g.e.STRUCTURES.starbase.upgradeCost,undefined);
 g.p.hand[0].upgraded=upgraded;
 const before=JSON.stringify(g.s);
 for(const discount of [null,'matter','energy','biomass','data']){
  assert.equal(g.e.constructAt(0,coord,'starbase',discount,true),false);
  assert.equal(g.e.constructAt(0,coord,'starbase',discount,false),false);
 }
 assert.equal(g.e.buildUpgrade(0,coord,'starbase'),false);
 assert.equal(JSON.stringify(g.s),before,'Rejected upgrade spends no resources or cards');
 const a=g.adapter(),actions=a.legalActions(0);
 assert(!actions.some(x=>x.type==='build'&&x.kind==='starbase'&&x.coord===coord));
 assert(actions.some(x=>x.type==='build'&&x.kind==='settler'&&x.coord===coord));
 assert(actions.some(x=>x.type==='build'&&x.kind==='explorer'&&x.coord===coord));
 assert(actions.some(x=>x.type==='build'&&x.kind==='fleet'&&x.coord===coord));
 assert.throws(()=>a.applyAction(0,{type:'build',card:'construct',key:'construct',coord,kind:'starbase',discountResource:null}),/Illegal action/);
 assert.equal(JSON.stringify(g.s),before,'Forged upgrade command is atomic');
 assert.deepEqual(plain(g.combatPieces(0,coord,true,true)),[{type:'starbase',hull:3,power:3,damage:0}]);
 assert.equal(g.buildingLabel(g.s.planets[coord]),'Shipyard');
 const harvester=g.s.clusters[0].coords[2];assert(g.e.constructAt(0,harvester,'harvester'));assert(g.e.constructAt(0,harvester,'harvester'));
 assert.equal(g.s.planets[harvester].upgradeLevel,2,'Harvester still upgrades');
}
// With no open building sites or unit capacity, a rival must not plan a Shipyard upgrade.
{
 const g=game(),coords=g.s.clusters[0].coords,yard=coords[1];
 for(const coord of coords.slice(1))Object.assign(g.s.planets[coord],{owner:0,upgrade:'harvester',upgradeLevel:2});
 Object.assign(g.s.planets[yard],{upgrade:'starbase',upgradeLevel:1});
 g.s.fleets[yard]={0:{settler:0,explorer:0,fleet:5}};
 for(const strategy of ['military','economy','expansion']){g.p.strategy=strategy;assert.equal(g.chooseAiBuild(0),null);}
}
console.log('Single-level Shipyards: atomic direct/adapter rejection with every Construct discount, no AI upgrade plans, unchanged commissioning, 3 attack/hull, and working Harvester upgrades passed.');
