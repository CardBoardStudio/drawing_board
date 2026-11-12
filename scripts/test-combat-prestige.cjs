// Exercise the authoritative battle continuation, score, save, and replay paths.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),plain=x=>JSON.parse(JSON.stringify(x));
function fixture({attacker=0,a={fleet:1},d={settler:1},tag=null}={}){
 const c=vm.createContext({});let e,extra,seed=1729;
 const source=read('prototypes/galactic-reach/app.js').replace('    return createGalacticAdapter({','    options.testCapture({finishCombat,finishRound});\n    return createGalacticAdapter({');
 vm.runInContext(read('prototypes/galactic-reach/adapter.js')+read('crates/galactic-reach/rules/replay-view.js')+source,c);
 const factory=c.createGalacticAdapter;c.createGalacticAdapter=p=>{e=p;return factory(p);};
 c.createGalacticReach({headless:true,random:()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32),testCapture:p=>extra=p});
 const s=e.state,defender=attacker===0?1:0;
 s.planets={};s.fleets={'0,0':{[attacker]:{settler:0,explorer:0,fleet:0,...a}},'1,0':{[defender]:{settler:0,explorer:0,fleet:0,...d}}};s.activePlayer=attacker;s.phase='operations';s.turnStage='prep';
 for(const p of s.players){p.hand=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
 return {e,s,attacker,defender,...extra,adapter:()=>factory(e),start(){assert(e.executeMove(attacker,'0,0','1,0',{tag,moveGroup:'all'}));}};
}
function choose(g,action){assert(g.e.applyCombatAction(g.e.combatActor(),action));}
function stays(g){while(g.s.pendingCombat?.stage==='escape')choose(g,{type:'combat_stay'});}
function volley(g,a='concentratedFire',d='concentratedFire'){choose(g,{type:'combat_tactic',tactic:a});choose(g,{type:'combat_tactic',tactic:d});}
function finish(g){let n=0;while(g.s.pendingCombat){assert(n++<20);choose(g,g.e.combatActions(g.e.combatActor())[0]);}}
function awards(g,expected){assert.deepEqual(plain(g.s.players.map(p=>p.combatVictories)),expected);}

// All ship types qualify, for either attacker identity; an unrelated enemy fleet is irrelevant.
for(const attacker of [0,1])for(const unit of ['settler','explorer','fleet']){
 const g=fixture({attacker,a:{fleet:2},d:{[unit]:1}});g.s.fleets['5,0']={[g.defender]:{fleet:1}};
 g.start();stays(g);finish(g);
 assert.equal(g.s.players[attacker].combatVictories,1);assert.equal(g.s.players[g.defender].combatVictories,0);
 assert.equal(g.e.calculatePrestige(attacker),1);assert.equal(g.s.lastCombat.prestigeWinner,attacker);
 assert.match(g.s.lastCombat.summary.at(-1),/gained 1 Prestige/);
 assert.equal(g.adapter().observe(attacker).players[attacker].combatVictories,1);
 assert.equal(g.adapter().replayView().players[attacker].combatVictories,1);
 const before=JSON.stringify(g.s);g.finishCombat();assert.equal(JSON.stringify(g.s),before,'Finished fight cannot award twice');
 assert(!g.e.applyCombatAction(attacker,{type:'combat_tactic',tactic:'concentratedFire'}));
}
// A defender earns the point; subsequent losses do not erase it.
{
 const g=fixture({a:{settler:1},d:{fleet:1}});g.start();stays(g);finish(g);awards(g,[0,1,0,0]);
 g.s.fleets={};assert.equal(g.e.calculatePrestige(1),1);
 const restored=fixture();Object.assign(restored.s,plain(g.s));assert.equal(restored.e.calculatePrestige(1),1);
}
// Partial and total paid escapes disqualify the opponent's award.
for(const d of [{explorer:1},{explorer:1,settler:1}]){
 const g=fixture({d});g.s.players[1].resources.energy=1;g.start();choose(g,{type:'combat_stay'});choose(g,{type:'combat_escape',destination:'2,0',amount:1});
 if(g.s.pendingCombat){assert.equal(g.s.pendingCombat.escapedUnits.defender,1);finish(g);}
 awards(g,[0,0,0,0]);assert.equal(g.s.lastCombat.prestigeWinner,null);assert.equal(g.s.fleets['2,0'][1].explorer,1);
}
{
 const g=fixture({a:{explorer:1,settler:1},d:{fleet:1}});g.s.players[0].resources.energy=1;g.start();choose(g,{type:'combat_escape',destination:'0,0',amount:1});choose(g,{type:'combat_stay'});finish(g);awards(g,[0,0,0,0]);
}
// A legal withdrawal, an Emergency Jump, and mutual destruction award no points.
{
 const g=fixture({d:{fleet:1}});g.start();stays(g);volley(g,'defensiveScreen','defensiveScreen');volley(g);volley(g,'defensiveScreen','defensiveScreen');
 assert.match(g.s.lastCombat.outcome,/retreated/);awards(g,[0,0,0,0]);
}
{
 const g=fixture({d:{fleet:2}});g.s.players[0].hand=[{key:'emergencyJump',id:'jump'}];g.start();stays(g);volley(g,'defensiveScreen','defensiveScreen');
 assert.match(g.s.lastCombat.summary.join(' '),/Emergency Jump/);assert.match(g.s.lastCombat.outcome,/retreated/);awards(g,[0,0,0,0]);
}
{
 const g=fixture({d:{fleet:1}});g.start();stays(g);volley(g);volley(g);assert(!g.s.fleets['1,0']);awards(g,[0,0,0,0]);
}
// Failed retreat destroys the remaining attacker, so the surviving defender qualifies.
{
 const g=fixture({d:{fleet:1}});g.start();stays(g);for(const coord of ['2,0','2,-1','1,-1','0,1','1,1'])g.s.fleets[coord]={2:{fleet:1}};g.s.fleets['0,0']={0:{fleet:5}};
 volley(g,'defensiveScreen','defensiveScreen');volley(g);volley(g,'defensiveScreen','defensiveScreen');
 assert.match(g.s.lastCombat.outcome,/surviving ship was destroyed/);awards(g,[0,1,0,0]);
}
// Empty territory and a structure without enemy units cannot be farmed for Prestige.
for(const upgrade of [null,'starbase']){
 const g=fixture({a:{fleet:2},d:{}});g.s.planets['1,0']={owner:1,upgrade,upgradeLevel:1,cluster:0};g.start();finish(g);awards(g,[0,0,0,0]);
}
// A mixed force earns one point for the battle, not one per destroyed unit.
{
 const g=fixture({a:{fleet:3},d:{explorer:2,settler:1,fleet:1}});g.start();stays(g);finish(g);awards(g,[1,0,0,0]);
}
// Serializing after an escape or a secret commitment preserves eligibility exactly.
for(const escaped of [false,true]){
 const g=fixture({d:escaped?{explorer:1,settler:1}:{settler:1}});g.s.players[1].resources.energy=1;g.start();choose(g,{type:'combat_stay'});
 choose(g,escaped?{type:'combat_escape',destination:'2,0',amount:1}:{type:'combat_stay'});choose(g,{type:'combat_tactic',tactic:'concentratedFire'});
 const resumed=fixture();Object.assign(resumed.s,plain(g.s));finish(g);finish(resumed);
 assert.deepEqual(plain(resumed.s.players.map(p=>p.combatVictories)),plain(g.s.players.map(p=>p.combatVictories)));
 assert.equal(resumed.s.players[0].combatVictories,escaped?0:1);assert.deepEqual(plain(resumed.s.lastCombat),plain(g.s.lastCombat));
}
// Existing archived games do not acquire the new scoring field in their replays.
{
 const c=vm.createContext({});vm.runInContext(read('crates/galactic-reach/rules/v16-adapter.js')+read('crates/galactic-reach/rules/replay-view.js')+read('crates/galactic-reach/rules/v16-app.js'),c);
 const archived=c.createGalacticReach({headless:true,random:()=>0});
 assert(archived.replayView().players.every(p=>!('combatVictories' in p)&&p.prestige===1));
}
// Reaching 10 through combat still waits for the round-end victory check.
{
 const g=fixture();g.s.players[0].combatVictories=9;g.start();stays(g);finish(g);assert.equal(g.e.calculatePrestige(0),10);assert.equal(g.s.winner,null);g.finishRound();assert.equal(g.s.winner,0);
}
console.log('Combat Prestige: attacker/defender and all ship types, one point per wipe, partial/full escapes, retreats/Jump, mutual loss, trapped destruction, no undefended-structure points, permanent totals, atomic continuation, reload/replay, and round-end victory passed.');
