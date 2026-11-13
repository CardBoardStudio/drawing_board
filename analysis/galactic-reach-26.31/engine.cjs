// Test-only observers and exact archived-policy controls. No production edits.
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Non-unique study anchor: '+a);return s.replace(a,b);};
function compile(kind,instrument,scopes){
 const prefix=kind==='baseline'?'crates/galactic-reach/rules/v25-':'prototypes/galactic-reach/';
 let source=fs.readFileSync(path.join(ROOT,prefix+'app.js'),'utf8');
 const adapter=fs.readFileSync(path.join(ROOT,prefix+'adapter.js'),'utf8');

 source=once(source,"if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === 0 || state.winner !== null) return;","if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;");
 source=once(source,'  function logEvent(text) {','  function logEvent(text) { options.onEvent?.(state.round,text);');
 source=once(source,'  const headless = options.headless === true;','  const headless = options.headless === true;\n  const recordStudyCombat=(...args)=>options.onCombat?.(...args);');
 source=once(source,'  function resolveCombat(attackerId, coord, origin, options = {}) {\n    const defenderId','  function resolveCombat(attackerId, coord, origin, options = {}) {\n    recordStudyCombat(attackerId,coord,origin);\n    const defenderId');
 source=once(source,'  function finishRound() {','  function finishRound() { options.onRoundEnd?.();');
 const wrappers=instrument?Object.entries(scopes).filter(([fn])=>source.includes('  function '+fn+'(')).map(([fn,label])=>`    ${fn}=options.studyWrap('${label}',${fn});`).join('\n'):'';
 source=once(source,'  if (headless) {\n    state = newState();',`  if (headless) {\n${wrappers}\n    state = newState();\n    state.firstPlayer=options.firstPlayer??0;\n    options.studySetup?.(state);`);
 source=once(source,'    return createGalacticAdapter({',`    options.capture({get state(){return state;},setStudyState(s){state=s;},getStudySerial(){return cardSerial;},setStudySerial(n){cardSerial=n;},runAiOperation,runAiBuy,combatActor,combatView,combatActions,applyCombatAction,chooseCombatAction,trimResourcesToCapacity,overflowPlayer,calculatePrestige,prestigeBreakdown,colonyPlanets,controlledPlanets,totalResources,playerCapacity,aiIncome,constructAt,combatPieces,ownerProductionAmount,fleetControllersAt,chooseAiMove,chooseAiBuild,ALL_CARDS,SHIP_STATS,STRUCTURES,EXCAVATION_COST,canAfford,findColonizeTarget,executeMove,clusterKnown,clusterRevealed,relicKnown});\n    return createGalacticAdapter({`);
 return new Function('module',adapter+'\n'+source+'\nreturn module.exports;')({exports:{}});
}
module.exports={compile,ROOT};
