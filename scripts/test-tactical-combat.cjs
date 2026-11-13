// Exercise the authoritative combat continuation and private transport, not a mock.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),plain=v=>JSON.parse(JSON.stringify(v));
function fixture({attacker=0,a={fleet:1},d={fleet:1},tag=null,card=false}={}) {
  const c=vm.createContext({});vm.runInContext(read('prototypes/galactic-reach/adapter.js')+read('prototypes/galactic-reach/app.js'),c);
  let e,seed=1729,calls=0;const factory=c.createGalacticAdapter;c.createGalacticAdapter=x=>{e=x;return factory(x);};
  c.createGalacticReach({headless:true,random:()=>{calls++;return((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);}});
  const s=e.state,defender=attacker===0?1:0;
  s.planets={};s.fleets={'0,0':{[attacker]:{settler:0,explorer:0,fleet:0,...a}},'1,0':{[defender]:{settler:0,explorer:0,fleet:0,...d}}};s.activePlayer=attacker;s.phase='operations';s.turnStage='prep';
  for(const p of s.players){p.hand=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
  if(card)s.players[attacker].hand=[{key:'move',id:'battle-move'}];
  return {e,s,attacker,defender,adapter:()=>factory(e),calls:()=>calls,start(){if(card){const adapter=factory(e);adapter.applyAction(attacker,adapter.legalActions(attacker).find(x=>x.type==='move'&&x.destination==='1,0'));}else assert(e.executeMove(attacker,'0,0','1,0',{tag,moveGroup:'all'}));}};
}
function choose(g,action){assert(g.e.applyCombatAction(g.e.combatActor(),action));}
function stays(g){while(g.s.pendingCombat?.stage==='escape')choose(g,{type:'combat_stay'});}
function volley(g,a='concentratedFire',d='concentratedFire'){choose(g,{type:'combat_tactic',tactic:a});choose(g,{type:'combat_tactic',tactic:d});}
function finish(g){let n=0;while(g.s.pendingCombat){assert(n++<20);choose(g,g.e.combatActions(g.e.combatActor())[0]);}}
// No tactic randomness, fresh hand each battle, rejected commands and inspection pure.
for(const attacker of [0,1]){
  const g=fixture({attacker,card:true});const rng=g.calls();g.start();const a=g.adapter();
  assert.equal(g.s.activePlayer,attacker);assert.equal(g.s.players[attacker].inPlay.filter(c=>c.id==='battle-move').length,1);
  assert(g.s.pendingMove);stays(g);
  for(const seat of [attacker,g.defender]){
    const before=JSON.stringify(g.s);a.observe(seat);g.e.combatView(seat);g.e.combatActions(seat);a.legalActions(a.activeSeat());assert.equal(JSON.stringify(g.s),before);
    assert(!g.e.applyCombatAction(seat,{type:'combat_tactic',tactic:'heavyBarrage'}));assert.equal(JSON.stringify(g.s),before);
  }
  choose(g,{type:'combat_tactic',tactic:'concentratedFire'});
  const second=g.e.combatView(g.defender),first=g.e.combatView(attacker);
  assert(second.sides.attacker.committed);assert(!('choice' in second.sides.attacker));assert(!('hand' in second.sides.attacker));assert.equal(second.sides.attacker.remaining,4);assert.deepEqual(plain(second.sides.attacker.used),[]);
  assert.equal(first.sides.attacker.choice,'concentratedFire');assert.equal(g.s.pendingCombat.hands.attacker.concentratedFire,2,'No public decrement until reveal');
  const before=JSON.stringify(g.s);assert(!g.e.applyCombatAction(attacker,{type:'combat_tactic',tactic:'defensiveScreen'}));assert.equal(JSON.stringify(g.s),before);
  const view=a.observe(g.defender);assert.equal(view.combat.sides.attacker.choice,undefined);assert(!JSON.stringify(view).includes('commitments'));
  const fresh=g.adapter();assert(fresh.legalActions(g.defender).every(x=>x.type==='combat_tactic'));assert.throws(()=>fresh.applyAction(g.defender,{type:'pass'}),/Illegal action/);
  choose(g,{type:'combat_tactic',tactic:'defensiveScreen'});
  assert.deepEqual(plain(g.s.pendingCombat.volleys[0].attacker),{tactic:'concentratedFire',base:3,bonus:1,shields:0,damage:2});
  assert.equal(g.s.pendingCombat.attackerPieces[0].damage,3);assert.equal(g.s.pendingCombat.defenderPieces[0].damage,2);
  assert.equal(g.calls(),rng,'Combat, inspection and rejection draw no random numbers');
  finish(g);assert.equal(g.s.activePlayer,(attacker+1)%4);assert(!g.s.pendingMove);assert.equal(g.s.players[attacker].inPlay.filter(c=>c.id==='battle-move').length,1);
  const after=JSON.stringify(g.s);assert(!g.e.applyCombatAction(g.defender,{type:'combat_tactic',tactic:'concentratedFire'}));assert.equal(JSON.stringify(g.s),after);
}
// Exhaustion and simultaneous damage from pre-volley survivors.
{
 const g=fixture();g.start();stays(g);volley(g);assert.equal(g.s.pendingCombat.attackerPieces[0].damage,4);volley(g);
 assert(!g.s.fleets['1,0']);assert.equal(g.s.lastCombat.volleys.length,2);assert.match(g.s.lastCombat.summary[0],/3 base \+ 1 bonus − 0 shields = 4 damage/);
 g.s.fleets={'0,0':{0:{fleet:1}},'1,0':{1:{fleet:1}}};g.start();assert.deepEqual(plain(g.s.pendingCombat.hands.attacker),{concentratedFire:2,defensiveScreen:2});
}
{
 const g=fixture();g.start();stays(g);volley(g,'defensiveScreen','defensiveScreen');volley(g,'defensiveScreen','defensiveScreen');
 assert(g.s.pendingCombat);assert.deepEqual(plain(g.e.combatActions(0)),[{type:'combat_tactic',tactic:'concentratedFire'}]);
 const before=JSON.stringify(g.s);assert(!g.e.applyCombatAction(0,{type:'combat_tactic',tactic:'defensiveScreen'}));assert.equal(JSON.stringify(g.s),before);finish(g);
}
{
 const g=fixture({a:{explorer:1},d:{explorer:1}});g.start();stays(g);volley(g);assert(!g.s.fleets['1,0'],'Both fragile attackers still deal their simultaneous damage');
}
// Three volleys with damage persisting; defenders hold and survivors repair next fight.
{
 const g=fixture();g.start();stays(g);volley(g,'defensiveScreen','defensiveScreen');volley(g);volley(g,'defensiveScreen','defensiveScreen');
 assert.equal(g.s.lastCombat.volleys.length,3);assert.equal(g.s.fleets['0,0'][0].fleet,1);assert.equal(g.s.fleets['1,0'][1].fleet,1);assert.match(g.s.lastCombat.outcome,/retreated/);
 g.start();assert.equal(g.s.pendingCombat.attackerPieces[0].damage,0);
}
// Actual destruction when every retreat is unsafe or full; preferred origin capacity checked.
{
 const g=fixture();g.start();stays(g);for(const coord of ['2,0','2,-1','1,-1','0,1','1,1'])g.s.fleets[coord]={2:{fleet:1}};g.s.fleets['0,0']={0:{fleet:5}};
 volley(g,'defensiveScreen','defensiveScreen');volley(g);volley(g,'defensiveScreen','defensiveScreen');assert(!g.s.fleets['1,0'][0]);assert.equal(g.s.fleets['0,0'][0].fleet,5);assert.match(g.s.lastCombat.outcome,/surviving ship was destroyed/);
}
// Defender Settler uses4 hull; attacker uses2. Fleet attack advantage is direct.
{
 const g=fixture({a:{settler:1},d:{settler:1}});g.start();assert.equal(g.s.pendingCombat.attackerPieces[0].hull,2);assert.equal(g.s.pendingCombat.defenderPieces[0].hull,4);stays(g);volley(g);assert(!g.s.fleets['1,0'][0]);assert.equal(g.s.fleets['1,0'][1].settler,1);
 const f=fixture({d:{settler:1}});f.start();stays(f);volley(f);assert.equal(f.s.fleets['1,0'][0].fleet,1);assert(!f.s.fleets['1,0'][1]);
}
// Paid escape subsets, mixed units, capacity and legal destination/cost validation.
{
 const g=fixture({a:{fleet:1,explorer:2}});g.s.players[0].resources.energy=1;g.s.fleets['2,0']={0:{fleet:4}};g.start();
 const legal=g.e.combatActions(0);assert(legal.some(x=>x.type==='combat_escape'&&x.destination==='2,0'&&x.amount===1));assert(!legal.some(x=>x.amount===2));
 const before=JSON.stringify(g.s);for(const action of [{type:'combat_escape',destination:'9,9',amount:1},{type:'combat_escape',destination:'2,0',amount:2},{type:'combat_escape',destination:'2,0',amount:1,extra:1}])assert(!g.e.applyCombatAction(0,action));assert.equal(JSON.stringify(g.s),before);
 choose(g,{type:'combat_escape',destination:'2,0',amount:1});assert.equal(g.s.players[0].resources.energy,0);assert.equal(g.s.fleets['2,0'][0].explorer,1);assert.equal(g.s.fleets['1,0'][0].explorer,1);assert.equal(g.s.pendingCombat.attackerPieces.length,2);finish(g);
}
{
 const g=fixture({d:{explorer:2}});g.s.players[1].resources.energy=2;g.start();choose(g,{type:'combat_stay'});choose(g,{type:'combat_escape',destination:'2,0',amount:2});assert(!g.s.pendingCombat);assert.equal(g.s.lastCombat.volleys.length,0);assert.match(g.s.lastCombat.outcome,/seized/);assert.equal(g.s.fleets['2,0'][1].explorer,2);
}
{
 const g=fixture({a:{explorer:1}});g.start();assert.deepEqual(plain(g.e.combatActions(0)),[{type:'combat_stay'}]);
 g.s.players[0].resources.energy=1;for(const coord of ['2,0','2,-1','1,-1','0,0','0,1','1,1'])g.s.fleets[coord]={2:{fleet:1}};assert.deepEqual(plain(g.e.combatActions(0)),[{type:'combat_stay'}]);
}
// Relic/regular reactions and Fleet-only offensive bonuses are consumed at reveal.
for(const [key,bonus,shield] of [['targetingAlgorithms',2,0],['warSongOfHollowStars',4,0],['aegisOfSilentArchitects',1,4],['ablativePlating',1,2]]){
 const g=fixture();g.s.players[0].hand=[{key,id:'reaction'}];g.start();stays(g);choose(g,{type:'combat_tactic',tactic:'concentratedFire'});assert(g.s.players[0].hand.length);choose(g,{type:'combat_tactic',tactic:'concentratedFire'});
 assert.equal(g.s.pendingCombat?.volleys[0].attacker.bonus ?? g.s.lastCombat.volleys[0].attacker.bonus,bonus);assert.equal((g.s.pendingCombat||g.s.lastCombat).volleys[0].attacker.shields,shield);assert(g.s.players[0].inPlay.some(c=>c.id==='reaction'));
}
for(const [units,bonus] of [[{settler:1},1],[{fleet:1},3]]){
 const g=fixture({a:units,tag:'alienAssault'});g.s.players[0].hand=[{key:'warSongOfHollowStars',id:'song'}];g.start();stays(g);volley(g);const battle=g.s.pendingCombat||g.s.lastCombat;
 assert.equal(battle.volleys[0].attacker.bonus,bonus+(units.fleet?3:0));assert.equal(g.s.players[0].hand.some(c=>c.id==='song'),!units.fleet);
}
// Salvage overflow resumes after one move completion, never consumes a second card.
{
 const g=fixture({card:true});for(const seat of [0,1]){g.s.players[seat].hand.push({key:'salvageCrews',id:`salvage${seat}`});g.s.players[seat].resources.data=10;}g.start();stays(g);volley(g);volley(g);
 assert.equal(g.s.activePlayer,1);assert(!g.s.pendingMove);const a=g.adapter();assert.equal(a.activeSeat(),0);assert.equal(g.s.players[0].resources.matter,2);a.applyAction(0,{type:'discard_overflow',resource:'data',amount:2});assert.equal(a.activeSeat(),1);a.applyAction(1,{type:'discard_overflow',resource:'data',amount:2});assert.equal(g.s.players[0].inPlay.filter(c=>c.id==='battle-move').length,1);
}
// A JSON roundtrip resumes escape, a hidden commitment, and later damaged volleys.
for(const stage of ['escape','committed','later']){
 const g=fixture({card:true});g.start();if(stage!=='escape'){stays(g);choose(g,{type:'combat_tactic',tactic:'defensiveScreen'});}if(stage==='later'){choose(g,{type:'combat_tactic',tactic:'defensiveScreen'});volley(g,'concentratedFire','defensiveScreen');}
 const saved=JSON.stringify(g.s),resumed=fixture();Object.assign(resumed.s,JSON.parse(saved));const a=resumed.adapter();assert.equal(a.activeSeat(),g.e.combatActor());assert.deepEqual(plain(a.observe(a.activeSeat())),plain(g.adapter().observe(g.e.combatActor())));finish(resumed);assert.equal(resumed.s.activePlayer,1);assert.equal(resumed.s.players[0].inPlay.filter(c=>c.id==='battle-move').length,1);
}
// Enumerate all36 three-tactic sequence pairs: both choices have strategic use,
// and most Fleet mirrors preserve a third decision instead of wiping in volley1.
{
 const sequences=['FFD','FDF','FDD','DFF','DFD','DDF'],outcomes={mutual:0,win:0,hold:0};let third=0;
 for(const attack of sequences)for(const defend of sequences){const g=fixture();g.start();stays(g);for(let n=0;n<3&&g.s.pendingCombat;n++)volley(g,attack[n]==='F'?'concentratedFire':'defensiveScreen',defend[n]==='F'?'concentratedFire':'defensiveScreen');
   if(g.s.lastCombat.volleys.length===3)third++;
   const attacker=Object.values(g.s.fleets).some(group=>group[0]?.fleet),defender=Object.values(g.s.fleets).some(group=>group[1]?.fleet);
   outcomes[!attacker&&!defender?'mutual':!defender?'win':'hold']++;
 }
 assert.deepEqual(outcomes,{mutual:19,win:4,hold:13});assert.equal(third,27);
}
// Emergency Jump keeps its explicit condition; Overdrive suppresses early Jump,
// but the compulsory third-volley retreat still applies.
for(const tag of [null,'overdrive']){
 const g=fixture({d:{fleet:2},tag});g.s.players[0].hand=[{key:'emergencyJump',id:'jump'}];g.start();stays(g);volley(g,'defensiveScreen','defensiveScreen');
 if(tag===null){assert(!g.s.pendingCombat);assert.match(g.s.lastCombat.summary.join(' '),/Emergency Jump/);assert(g.s.players[0].inPlay.some(c=>c.id==='jump'));}
 else{assert(g.s.pendingCombat);assert(g.s.players[0].hand.some(c=>c.id==='jump'));}
}
// A defending structure remains after all Explorers escape, so battle continues.
{
 const g=fixture({d:{explorer:1}});g.s.planets['1,0']={owner:1,upgrade:'starbase',upgradeLevel:1,cluster:0};g.s.players[1].resources.energy=1;g.start();choose(g,{type:'combat_stay'});choose(g,{type:'combat_escape',destination:'2,0',amount:1});assert(g.s.pendingCombat);assert.equal(g.s.pendingCombat.defenderPieces[0].type,'starbase');assert.equal(g.s.pendingCombat.stage,'tactic');
}
// Old14.19 assets are a byte-for-byte archive of the previous release.
const archived14Hashes={"app.js": "3d47c5cfb623a84781790ce8586bfba852eca308f360e0ecce959a5556d6aace", "adapter.js": "711b6584e86520b6c816a37d46df315386a84d09d3bbaf18d2691ad0d7662cd2", "index.html": "6e793ede4cdb28217e6ef8e940591a11c074b1a35e8bf6c8d1b7eafba00e1979", "styles.css": "da5262231b48446f5dc22cb55502ceaed6c764d2095d06a33fd29a88c9fe0004", "rulebook.html": "234c8050203b68327aae8270893bc7938700bc900564e12b8888f70f43df3c8b", "rulebook.css": "c89d7ff15fc902e2dda07d2ef54213e9ec09796a736c596dbc411c12fa5c1e5b", "replay.js": "b7b14140bd6c87aa41d73e2fa26d3f4c43b10168137f66afb7b7935428952c95"};
for(const [asset,hash] of Object.entries(archived14Hashes))assert.equal(require('node:crypto').createHash('sha256').update(read(`crates/galactic-reach/rules/v14-${asset}`)).digest('hex'),hash);
console.log('Tactical combat: fixed hands/no RNG, secret commitments, exhaustion, simultaneous damage, roles, paid escapes, trapped retreat, reactions, overflow, one move completion, reload continuation, and14.19 archive passed.');
