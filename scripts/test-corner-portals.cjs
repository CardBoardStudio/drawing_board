// #corner-portals: straight-across boundary pairs, weighted Move routes and public information.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function game(prefix='prototypes/galactic-reach/',keepMap=false){
 const c=vm.createContext({});vm.runInContext(read(prefix+'adapter.js')+read(prefix+'app.js').replace('      clone, deckContents,','      chooseAiMove, clone, deckContents,'),c);
 let e,seed=1729;const factory=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return factory(x);};
 c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32)});
 const s=e.state;s.phase='operations';s.activePlayer=0;s.players.forEach(p=>{p.hand=[];});if(!keepMap)s.planets={};
 return {e,s,p:s.players[0],a:()=>factory(e)};
}
const from='-10,8',exit='8,-10',units=(settler=0,explorer=0,fleet=0)=>({settler,explorer,fleet});
const moves=g=>g.a().legalActions(0).filter(a=>a.type==='move');
const move=(g,to)=>{const a=moves(g).find(a=>a.destination===to);assert(a,'Expected legal move to '+to);g.a().applyAction(0,a);return a;};
const distance=(a,b)=>{const [q,r]=a.split(',').map(Number),[x,y]=b.split(',').map(Number);return Math.max(Math.abs(q-x),Math.abs(r-y),Math.abs(q+r-x-y));};

// The screenshot's two five-hex arms share their corner. Keep the aligned order, without rotation.
{
 const g=game(),left=['-10,6','-10,7','-10,8','-10,9','-10,10','-9,10','-8,10','-7,10','-6,10'],right=['6,-10','7,-10','8,-10','9,-10','10,-10','10,-9','10,-8','10,-7','10,-6'];
 assert.equal(g.a().rulesVersion,'galactic-reach/39.44');assert.equal(g.s.version,39);assert.equal(g.s.rulesRevision,44);
 assert.deepEqual(plain(g.s.portalLinks),Object.fromEntries(left.flatMap((a,i)=>[[a,right[i]],[right[i],a]])));
 assert.notEqual(g.s.portalLinks['-10,6'],'10,-6','The exits are straight across, not rotated 180 degrees');
 for(let seat=0;seat<4;seat++){const v=g.a().observe(seat);assert.deepEqual(plain(v.portalLinks),plain(g.s.portalLinks));assert.equal(v.portalMovementCost,2);}
}
// A Fleet crosses for exactly 2 movement, with one Move card and no resource payment.
{
 const g=game();g.p.hand=[{key:'move',id:'m'}];g.s.fleets={[from]:{0:units(0,0,1)}};
 assert(!g.e.reachableFrom(from,0,1).includes(exit));assert(g.e.reachableFrom(from,0,2).includes(exit));
 assert.equal(g.e.movementRoutes(from,0,2).get(exit).cost,2);
 const resources=plain(g.p.resources);move(g,exit);assert.equal(g.s.fleets[exit][0].fleet,1);assert(!g.s.fleets[from]);
 assert.deepEqual(plain(g.p.resources),resources);assert(g.p.inPlay.some(c=>c.id==='m'));assert(g.s.log.some(x=>x.includes('via the corner portal')));
}
// Approach + crossing costs 3; base Settlers need a range bonus to cross at all.
{
 const g=game();g.p.hand=[{key:'move',id:'m'}];g.s.fleets={'-9,8':{0:units(0,1,0)}};
 assert(!g.e.reachableFrom('-9,8',0,2).includes(exit));assert.equal(g.e.movementRoutes('-9,8',0,3).get(exit).cost,3);move(g,exit);
 const h=game();h.s.fleets={[from]:{0:units(1)}};h.p.hand=[{key:'move',id:'slow'}];assert(!moves(h).some(a=>a.destination===exit));
 h.p.hand[0].upgraded=true;move(h,exit);assert.equal(h.s.fleets[exit][0].settler,1);
}
// A crossing is part of the route; a fast group can keep moving after it.
{
 const g=game();g.s.fleets={[from]:{0:units(0,0,1)}};g.p.hand=[{key:'move',id:'fast',upgraded:true}];
 assert.equal(g.e.movementRoutes(from,0,3).get('8,-9').cost,3);move(g,'8,-9');assert.equal(g.s.fleets['8,-9'][0].fleet,1);
}
// Hostile exits end a route. Only the selected Fleet enters combat; the rest stay behind.
{
 const g=game();g.s.fleets={[from]:{0:units(1,1,2)},[exit]:{1:units(0,0,1)}};g.p.hand=[{key:'move',id:'fight',upgraded:true}];
 assert(!g.e.reachableFrom(from,0,3).includes('8,-9'));assert(!g.e.reachableFrom(from,0,3,true).includes(exit));
 const a=moves(g).find(a=>a.destination===exit&&a.units.fleet===1&&!a.units.settler);assert(a);g.a().applyAction(0,a);
 assert.deepEqual(plain(g.s.fleets[from][0]),units(1,1,1));assert.equal(g.s.pendingCombat.attackerPieces.length,1);
 assert.equal(g.s.pendingMove.movementCost,2);assert.equal(g.s.pendingMove.portalCrossings,1);
 assert.equal(g.a().snapshotState().state.pendingMove.movementCost,2,'Pending combat keeps its weighted move in the saved snapshot');
}
// Escapes still use physical adjacent hexes, even when combat is on an entrance.
{
 const g=game();g.s.fleets={[from]:{0:units(0,0,1)},[exit]:{1:units(0,1,0)}};g.p.hand=[{key:'move',id:'fight'}];g.s.players[1].resources.energy=1;move(g,exit);
 g.e.applyCombatAction(0,{type:'combat_stay'});
 const escapes=g.e.combatActions(1).filter(a=>a.type==='combat_escape');assert(escapes.length);assert(escapes.every(a=>distance(exit,a.destination)===1));assert(!escapes.some(a=>a.destination===from));
}
// Probe keeps physical distance; public portals do not reveal the hidden moon or its relic.
{
 const g=game();g.s.fleets={[from]:{0:units(0,1,0)}};g.p.hand=[{key:'probe',id:'p'}];
 const sites=['-6,8','8,-9'];g.s.clusters=sites.map((coord,id)=>({id,kind:'moon',center:coord,coords:[coord],name:'Hidden '+id,scannedBy:[],revealedBy:[]}));
 g.s.planets=Object.fromEntries(sites.map((coord,id)=>[coord,{cluster:id,type:'moon',name:'Hidden '+id,special:'relic',relicClaimed:false,owner:null,upgrade:null}]));
 assert.equal(g.e.travelDistance(from,sites[1]),3);assert.equal(distance(from,sites[0]),4);
 const v=g.a().observe(1);assert.equal(Object.keys(v.planets).length,0);assert.equal(Object.keys(v.portalLinks).length,18);
 assert(g.e.probeRelic(0,from,'p'));assert(g.s.clusters[0].scannedBy.includes(0));assert(!g.s.clusters[1].scannedBy.includes(0));
}
// Browser rivals use the public cost-2 route to a favorable battle.
{
 const g=game(undefined,true);g.p.strategy='military';g.p.hand=[{key:'move',id:'bot'}];g.s.fleets={[from]:{0:units(0,0,3)},[exit]:{1:units(0,0,1)}};
 const choice=g.e.chooseAiMove(0,g.p.hand[0]);assert(choice);assert.equal(choice.source,from);assert.equal(choice.destination,exit);
}
// The archived portal experiment preserves its original terrain/RNG contract.
// Current setup intentionally moves the two corner worlds inward.
{
 const portal=game('crates/galactic-reach/rules/v35-',true),old=game('crates/galactic-reach/rules/v33-',true);
 assert.deepEqual(plain(portal.s.planets),plain(old.s.planets),'Archived portal setup preserves its original terrain');assert.deepEqual(plain(portal.s.clusters),plain(old.s.clusters));
 assert.equal(old.a().rulesVersion,'galactic-reach/33.38');assert.equal(old.s.portalLinks,undefined);assert(!old.e.reachableFrom(from,0,2).includes(exit));
 for(const [file,hash] of Object.entries(JSON.parse(read('scripts/corner-portal-archive-hashes.json'))))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),hash,file);
}
console.log('Corner portal: aligned geometry, public signals, weighted range, mixed routes, ship roles, hostile exits, saved combat, physical escapes/Probe, rival routing and immutable 33.38 passed.');
