// Exhaustive legal tactic sequences, resolved by the actual 16.21 engine.
const fs=require('node:fs'),path=require('node:path');
const {engineAt,seeded}=require('./run.cjs');
const factory=engineAt('/private/tmp/drawing-board-compact-frontier','browser');
const sequences=['FFD','FDF','FDD','DFF','DFD','DDF'];
function trial(attacking,defending,attack,defend){
 let e;factory({headless:true,random:seeded(1729),capture:x=>e=x});
 const s=e.state;s.planets={};s.fleets={'0,0':{0:{settler:0,explorer:0,fleet:0,...attacking}},'1,0':{1:{settler:0,explorer:0,fleet:0,...defending}}};s.activePlayer=0;s.phase='operations';s.turnStage='prep';
 for(const p of s.players){p.hand=[];p.deck=[];p.discard=[];p.resources={matter:0,energy:0,biomass:0,data:0};}
 if(!e.executeMove(0,'0,0','1,0',{moveGroup:'all'}))throw Error('Fixture movement failed');
 while(s.pendingCombat?.stage==='escape')if(!e.applyCombatAction(e.combatActor(),{type:'combat_stay'}))throw Error('Stay failed');
 while(s.pendingCombat){const seat=e.combatActor(),v=s.pendingCombat.volley,letter=(seat===0?attack:defend)[v];if(!e.applyCombatAction(seat,{type:'combat_tactic',tactic:letter==='F'?'concentratedFire':'defensiveScreen'}))throw Error('Tactic failed');}
 const count=seat=>Object.values(s.fleets).reduce((n,g)=>n+Object.values(g[seat]||{}).reduce((a,b)=>a+b,0),0);
 const a=count(0),d=count(1),outcome=!a&&!d?'mutual_destruction':!d?'attacker_seizes':!a?'defender_survives':'defender_holds_attacker_retreats';
 return {attack,defend,outcome,attackerSurvivors:a,defenderSurvivors:d,volleys:s.lastCombat.volleys.length,report:s.lastCombat.outcome};
}
const scenarios=[
 ['1 Fleet vs 1 Fleet',{fleet:1},{fleet:1}],
 ['2 Fleets vs 2 Fleets',{fleet:2},{fleet:2}],
 ['2 Fleets vs 1 Fleet',{fleet:2},{fleet:1}],
 ['1 Fleet vs 2 Fleets',{fleet:1},{fleet:2}],
 ['1 Fleet vs defending Settler',{fleet:1},{settler:1}],
 ['attacking Settler vs 1 Fleet',{settler:1},{fleet:1}],
 ['1 Fleet vs 2 defending Settlers',{fleet:1},{settler:2}],
 ['1 Explorer vs defending Settler',{explorer:1},{settler:1}],
 ['1 Fleet vs 1 Explorer (no escape)',{fleet:1},{explorer:1}],
 ['1 Fleet + Explorer vs 1 Fleet',{fleet:1,explorer:1},{fleet:1}],
];
const results=scenarios.map(([name,a,d])=>{const trials=sequences.flatMap(x=>sequences.map(y=>trial(a,d,x,y))),outcomes={};for(const t of trials)outcomes[t.outcome]=(outcomes[t.outcome]||0)+1;return {name,attacker:a,defender:d,outcomes,meanVolleys:trials.reduce((n,t)=>n+t.volleys,0)/36,trials};});
fs.writeFileSync(path.join(__dirname,'combat.json'),JSON.stringify({notes:['All36 legal three-tactic sequence pairings per matchup; early battle endings truncate sequences.','Pairings are enumerated cases, not probabilities of human decisions.','No regular-deck reactions, shipyards or paid escape; retreat space is available.'],results},null,2));
console.log(JSON.stringify(results.map(({trials,...rest})=>rest),null,2));
