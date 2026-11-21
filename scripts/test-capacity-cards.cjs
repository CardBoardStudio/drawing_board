// 31.36 Capacity Cards: the market, military deck, card effects, Prestige target and rivals.
// Rules: rulebook #capacity-cards, #buy, #military-deck, #cards, #victory-target, #rival-cards.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const app = read('prototypes/galactic-reach/app.js'), adapterSource = read('prototypes/galactic-reach/adapter.js');
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function game(options = {}) {
  const c = vm.createContext({});
  vm.runInContext(adapterSource + app.replace('      clone, deckContents,', '      runAiBuy, runAiOperation, aiTargetCard, aiBuyValue, resolveCardEffect, clone, deckContents,'), c);
  let e; const factory = c.createGalacticAdapter; c.createGalacticAdapter = x => { e = x; return factory(x); };
  c.createGalacticReach({ headless: true, random: rng(31), ...options });
  return { e, s: e.state, p: e.state.players[0], adapter: () => factory(e) };
}
function act(g, seat, type, match = () => true) {
  const a = g.adapter(), action = a.legalActions(seat).find(x => x.type === type && match(x));
  assert(action, `Expected a legal ${type}`); a.applyAction(seat, action); return action;
}
const big = p => { p.resourceLimits = { matter: 30, energy: 30, biomass: 30, data: 30 }; p.resources = { matter: 20, energy: 20, biomass: 20, data: 20 }; };

// Catalog: 34 retained designs; the price experiment adds six affordable utility designs.
const catalog = vm.runInContext(app + ';createGalacticReach({catalog:true})', vm.createContext({}));
const cards = { ...catalog.ADVANCED_CARDS, ...catalog.MARKET_MILITARY };
const codes = Object.values(cards).map(c => c.code);
assert.equal(Object.keys(catalog.ADVANCED_CARDS).length, 25); assert.equal(Object.keys(catalog.MARKET_MILITARY).length, 9);
assert.equal(new Set(codes).size, 34, 'Card ids are unique');
assert.deepEqual(codes.filter(c => c[0] === 'N').sort(), Array.from({ length: 32 }, (_, i) => `N${String(i + 1).padStart(2, '0')}`).filter(c=>!['N06','N11','N12','N13','N14','N15','N24'].includes(c)));
assert.deepEqual(codes.filter(c => c[0] === 'M').sort(), Array.from({ length: 10 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`).filter(c=>c!=='M04'));
for (const [key, def] of Object.entries(cards)) {
  assert(['exchangeProtocol','barterNetwork','clearingHouse','signalRelay','surveyNetwork','tacticalBriefing','strikeVector','prefabYards','seedArk','colonyPods','procurementHub','tradeSyndicate'].includes(key)||Object.values(def.cost).some(n => n > catalog.STARTING_LIMIT), `${key} must need a raised limit`);
  assert.equal(!!def.military, def.code[0] === 'M');
}
const prices = Object.values(cards).map(c => Object.values(c.cost).reduce((n, x) => n + x, 0));
// 32.37 (Cheaper Cards): about 30% cheaper, from exactly 5 of one resource (one upgrade) to 14.
assert.equal(Math.min(...prices), 3, 'The cheapest draw cards still cost three resources');
assert.equal(Math.max(...prices), 14, 'Top cards stay aspirational');
assert.equal(prices.reduce((n, p) => n + p, 0), 219, 'Price v1 reduces the eight selected designs by eleven resources total');
assert.equal(catalog.rulesVersion, 'galactic-reach/39.44');

// Setup: nine face-up cards (three per price tier) from 54 cards that mix both decks; target defaults to 30.
{
  const g = game(), { s } = g, decks = Object.values(s.marketDecks).flat();
  assert.equal(s.market.length, 9); assert.equal(s.market.length + decks.length, 54); assert.equal(s.victoryTarget, 30);
  delete s.victoryTarget; assert.equal(g.e.victoryTarget(),40,'Legacy targetless saves retain40');
  const supply = [...s.market, ...decks].map(c => c.key);
  for (const key of Object.keys(catalog.MARKET_CARDS)) assert.equal(supply.filter(k => k === key).length, 2, `${key} has two copies`);
  assert.equal(game({ victoryTarget: 40 }).s.victoryTarget, 40, 'Explicit40-point games retain their chosen target'); assert.equal(game({ victoryTarget: 35 }).s.victoryTarget, 30, 'Unlisted targets fall back to 30');
  assert.equal(game({ newGameSettings: { victoryTarget: 60 } }).s.victoryTarget, 60, 'Table settings choose the target');
}
// Starting limits can hold the specified entry cards; higher-cost cards still need capacity.
{
  const g = game(), { s, p } = g; s.phase = 'buy'; s.activePlayer = 0; p.passed = true; p.resources = { matter: 4, energy: 4, biomass: 4, data: 4 };
  assert(g.adapter().legalActions(0).filter(a=>a.type==='buy'&&a.source==='market').every(a=>['exchangeProtocol','barterNetwork','clearingHouse','signalRelay','surveyNetwork','tacticalBriefing','strikeVector','prefabYards','seedArk','colonyPods','procurementHub','tradeSyndicate'].includes(a.key)));
  s.market = [{ key: 'ionThrusters', id: 'ion' }];
  // Rules #storage-allocation: buy a Capacity Module, then play it on a later Operations turn.
  act(g, 0, 'buy', a => a.source === 'capacity' && a.key === 'capacityModule');
  const module = p.discard.find(c => c.key === 'capacityModule'); assert(module, 'The module enters discard');
  assert.equal(p.resourceLimits.energy, 4, 'Buying a module raises nothing yet');
  p.discard.splice(p.discard.indexOf(module), 1); p.hand.push(module); s.phase = 'operations'; p.passed = false; s.turnStage = 'action';
  act(g, 0, 'special', a => a.card === module.id && a.allocation.energy === 4);
  assert(![...p.hand, ...p.inPlay, ...p.discard, ...p.deck].some(c => c.id === module.id), 'A played module leaves the deck cycle');
  assert.deepEqual(JSON.parse(JSON.stringify(p.storage.map(c => c.id))), [module.id], 'It goes to the Storage pile'); assert.equal(g.e.storageUpgradeCost(0).matter, 1, 'One stored module: the next still costs 1 of each');
  s.phase = 'buy'; s.activePlayer = 0; p.passed = true;
  assert.equal(p.resourceLimits.energy, 8); p.resources.energy = 5; p.resources.data = 1;
  act(g, 0, 'buy', a => a.key === 'ionThrusters');assert(p.discard.some(c => c.id === 'ion'));assert.equal(p.resources.energy, 0);
}
// Rules #storage-pile: stored modules never return through cleanup, reshuffle or draws.
{
  const g = game(), { s, p } = g;
  p.storage = [{ key: 'capacityModule', id: 'stored', allocation: { matter: 0, energy: 0, biomass: 0, data: 4 } }];
  p.discard.push(...p.deck.splice(0)); s.phase = 'buy'; s.activePlayer = 0;
  for (const q of s.players) { q.passed = true; q.hand = []; }
  let guard = 0; while (s.round === 1 && guard++ < 20) { const a = g.adapter(), seat = a.activeSeat(); a.applyAction(seat, a.legalActions(seat).find(x => x.type === 'finish_buy') || a.legalActions(seat)[0]); }
  assert.equal(s.round, 2, 'Cleanup reshuffled the discard and drew a new hand');
  assert.deepEqual(JSON.parse(JSON.stringify(p.storage.map(c => c.id))), ['stored']);
  assert(![...p.hand, ...p.deck, ...p.discard, ...p.inPlay].some(c => c.id === 'stored'), 'A stored module is never reshuffled or drawn');
  assert.equal(g.e.storageUpgradeCost(0).matter, 1);
  assert(!g.adapter().legalActions(0).some(a => a.card === 'stored'), 'No command can use or trash a stored module');
}
// Fixed pricing is independent of stored modules and prior purchases, including after reload.
for (const stored of [0, 1, 8]) {
  const g = game(), {s,p} = g;
  p.storage = Array.from({length:stored}, (_,i)=>({id:`stored-${i}`,key:'capacityModule',allocation:{matter:0,energy:0,biomass:0,data:4}}));
  p.resourceLimits.data = 4 + stored * 4;
  p.storagePurchases = stored;
  s.phase='buy';s.activePlayer=0;p.passed=true;
  p.resources={matter:2,energy:2,biomass:2,data:2};
  const before=s.capacitySupply;
  for(let i=0;i<2;i++) {
    assert.deepEqual(JSON.parse(JSON.stringify(g.e.storageUpgradeCost(0))),{matter:1,energy:1,biomass:1,data:1});
    act(g,0,'buy',a=>a.source==='capacity');
  }
  assert.deepEqual(JSON.parse(JSON.stringify(p.resources)),{matter:0,energy:0,biomass:0,data:0});
  assert.equal(s.capacitySupply,before-2);
  assert.equal(p.storagePurchases,stored+2);
  assert(!g.adapter().legalActions(0).some(a=>a.type==='buy'&&a.source==='capacity'),'No free purchase after resources run out');
  const resumed=game({resume:g.adapter().snapshotState()});
  assert.equal(resumed.e.storageUpgradeCost(0).matter,1,'Reload keeps the fixed price');
}
// Military cards join the military deck; Wonders pay Prestige; Buy cards discount a purchase.
{
  const g = game(), { s, p } = g; s.phase = 'buy'; s.activePlayer = 0; p.passed = true; big(p);
  s.market = [{ key: 'novaBarrage', id: 'nova' }, { key: 'dysonLattice', id: 'dyson' }, { key: 'railBattery', id: 'rail' }];
  p.hand = [{ key: 'procurementHub', id: 'hub' }, { key: 'tradeSyndicate', id: 'syn' }];
  p.resources.energy = 25;
  act(g, 0, 'buy_effect', a => a.card === 'hub'); assert.equal(p.buyHubDiscounts, 1);
  // 34.39: Procurement Hub's purchase also costs 1 less of each; with Trade Syndicate both apply.
  assert.deepEqual(JSON.parse(JSON.stringify(g.e.purchaseCost(p, 'dysonLattice'))), { matter: 3, energy: 7, data: 1 });
  act(g, 0, 'buy_effect', a => a.card === 'syn'); assert.deepEqual(JSON.parse(JSON.stringify(g.e.purchaseCost(p, 'dysonLattice'))), { matter: 2, energy: 6, data: 0 });
  act(g, 0, 'buy', a => a.key === 'dysonLattice');
  assert.equal(p.cardPrestige, 5); assert.equal(g.e.calculatePrestige(0), 8, 'Colony 3 + Dyson Lattice 5 (34.39)');
  assert.equal(p.resources.energy, 19, 'Trade Syndicate and Procurement Hub each took 1 off each resource of the next purchase');
  assert.equal(p.buyDiscountEach, 0, 'The discounts are used up'); assert.equal(p.buyHubDiscounts, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(g.e.purchaseCost(p, 'novaBarrage'))), { matter: 3, energy: 7 }, 'The next purchase is at full price');
  act(g, 0, 'buy', a => a.key === 'novaBarrage');
  assert(p.military.some(c => c.id === 'nova')); assert(!p.discard.some(c => c.id === 'nova'), 'Military cards never enter discard');
  assert.equal(s.market.length, 3, 'Each bought slot refills in place from its own tier deck (rules #market)');
  assert(g.adapter().legalActions(0).some(a => a.type === 'buy'), 'Affordable purchases remain legal after two buys');
}
// One-step orders: gains, draws, limits, Prestige, production, starter trash.
{
  const g = game(), { s, p, e } = g; s.activePlayer = 0; s.phase = 'operations';
  p.resourceLimits = { matter: 4, energy: 4, biomass: 4, data: 4 }; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 };
  p.hand = [{ key: 'cargoExpansion', id: 'cargo' }]; p.deck = []; p.discard = [];
  act(g, 0, 'special', a => a.card === 'cargo');
  assert.deepEqual(JSON.parse(JSON.stringify(p.resourceLimits)), { matter: 6, energy: 6, biomass: 6, data: 6 }, 'Cargo Expansion raises every limit');
  assert.equal(p.storagePurchases || 0, 0, 'Card capacity does not raise the next paid price');
  s.activePlayer = 0; p.hand = [{ key: 'ascendancyCodex', id: 'codex' }]; p.deck = [{ key: 'move', id: 'drawn' }];
  act(g, 0, 'special', a => a.card === 'codex'); assert.equal(p.cardPrestige, 2); assert(p.hand.some(c => c.id === 'drawn'));
  s.activePlayer = 0; p.hand = [{ key: 'commandNexus', id: 'nexus' }]; p.deck = [1, 2, 3, 4, 5].map(n => ({ key: 'move', id: `d${n}` }));
  act(g, 0, 'special', a => a.card === 'nexus'); assert.equal(p.hand.length, 4);
  assert(p.inPlay.some(c => c.id === 'nexus'), 'Used orders stay in play until cleanup');
}
// Construct cards print their discount; the build bonus follows a successful build only.
{
  const g = game(), { s, p, e } = g; s.activePlayer = 0; s.phase = 'operations';
  const site = s.clusters[0].coords[1]; p.resources = { matter: 0, energy: 0, biomass: 0, data: 0 };
  p.hand = [{ key: 'worldEngine', id: 'engine' }];
  const build = act(g, 0, 'build', a => a.card === 'engine' && a.coord === site && a.kind === 'starbase');
  assert.equal(build.discountResource, 'free'); assert.equal(s.planets[site].upgrade, 'starbase', 'World Engine builds at no cost');
  s.activePlayer = 0; p.resources = { matter: 1, energy: 0, biomass: 0, data: 0 }; p.hand = [{ key: 'prefabYards', id: 'foundry' }];
  const harvest = s.clusters[0].coords[2];
  act(g, 0, 'build', a => a.card === 'foundry' && a.coord === harvest && a.kind === 'harvester');
  assert.equal(p.resources.matter, 1, 'A discounted Harvester costs nothing and grants no resource reward');
  // 34.39: Prefab Yards then offers one more build at full price; finishing after one is allowed.
  assert.equal(s.pendingConstruct?.cardName, 'Prefab Yards'); act(g, 0, 'finish_construct'); assert.equal(s.pendingConstruct, null);
}
// 32.37 economy: a Harvester hex produces 2 (was 1); issue #41 costs and opening resources.
{
  const g = game(), { s, e } = g;
  assert.equal(e.HARVESTER_YIELD, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(e.SHIP_STATS.settler.cost)), { matter: 1, biomass: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(e.STRUCTURES.harvester.cost)), { matter: 1, energy: 1, data: 1 });
  for (const p of s.players) assert.deepEqual({ biomass: p.resources.biomass, data: p.resources.data }, { biomass: 1, data: 1 }, 'Every faction starts with 1 Biomass and 1 Data');
  const hex = s.clusters[0].coords[1]; Object.assign(s.planets[hex], { owner: 0, upgrade: 'harvester', occupiedBy: null });
  const type = s.planets[hex].type, before = s.players[0].resources[type];
  s.players[0].resourceLimits[type] = 20; s.phase = 'buy'; s.activePlayer = 0;
  for (const p of s.players) { p.passed = true; p.hand = []; }
  let guard = 0; while (s.round === 1 && guard++ < 20) { const a = g.adapter(); const seat = a.activeSeat(); a.applyAction(seat, a.legalActions(seat).find(x => x.type === 'finish_buy') || a.legalActions(seat)[0]); }
  assert.equal(s.round, 2);
  const view = g.adapter().observe(0);
  assert.equal(view.harvesterYield, 2); assert.equal(view.marketCosts.length, view.market.length, 'Server rivals read printed prices');
  assert(s.players[0].resources[type] >= before + 2, 'The Harvester hex produced 2 at the round start');
}
// Rivals: value and save toward a target card, buy a Capacity Module for it, then play it toward that price.
{
  const g = game(), { s, e } = g, bot = s.players[1];
  Object.assign(s.planets[s.clusters[1].coords[1]], { owner: 1, upgrade: 'starbase' });
  s.market = [{ key: 'ascendancyCodex', id: 'codex' }, { key: 'ionThrusters', id: 'ion' }];
  assert(e.aiBuyValue(1, 'ascendancyCodex') > e.aiBuyValue(1, 'ionThrusters'), 'Printed Prestige makes a card worth more');
  assert.equal(e.aiTargetCard(1).id, 'codex');
  s.market = [{ key: 'ascendancyCodex', id: 'codex' }];
  Object.assign(bot, { hand: [], deck: [], discard: [], inPlay: [], passed: true, resources: { matter: 4, energy: 4, biomass: 4, data: 4 } });
  s.phase = 'buy'; s.activePlayer = 1; e.runAiBuy();
  assert.equal(bot.storagePurchases, 1, 'The rival bought one Capacity Module toward a useful repeatable Prestige card');
  assert.equal(bot.resourceLimits.data, 4, 'Its limits rise only when the module is played');
  const module = bot.discard.find(c => c.key === 'capacityModule'); assert(module);
  bot.discard.splice(bot.discard.indexOf(module), 1); bot.hand = [module]; bot.passed = false; s.phase = 'operations'; s.activePlayer = 1;
  e.runAiOperation();
  assert(bot.resourceLimits.data > 4, 'Playing the module raised its Data limit toward the card');
  assert(!bot.hand.some(c => c.id === module.id) && !bot.inPlay.some(c => c.id === module.id), 'The played module leaves hand');
  assert(bot.storage.some(c => c.id === module.id), 'The rival stores the played module');
}
// A full game of four browser rivals reaches the 40-point target with the new cards.
{
  const c = vm.createContext({ console: { log() {}, warn() {}, error() {} } });
  const guard = "if (state.pendingCombat || state.phase !== 'operations' || state.activePlayer === ME || state.winner !== null) return;";
  assert(app.includes(guard), 'The rival guard this simulation lifts must still exist');
  let src = app.replace(guard, "if (state.pendingCombat || state.phase !== 'operations' || state.winner !== null) return;");
  src = src.replace(/\n  if \(headless\) \{[\s\S]*$/, `\n  state=newState();state.players[0].strategy='economy';fillMarket();beginRound();
  return {state:()=>state,step(){ if(state.winner!==null)return; if(state.pendingCombat){const seat=combatActor();applyCombatAction(seat,chooseCombatAction(combatView(seat),combatActions(seat)));return;}
    if(state.phase==='operations')runAiOperation();else if(state.phase==='buy')runAiBuy(); }, prestige:id=>calculatePrestige(id)};
}`);
  vm.runInContext(src, c);
  const sim = c.createGalacticReach({ headless: true, victoryTarget: 40, random: rng(20261114) });
  let steps = 0; while (sim.state().winner === null && steps++ < 20000) sim.step();
  const st = sim.state();
  assert.notEqual(st.winner, null, 'Rivals finish a 40-point game');
  assert(sim.prestige(st.winner) >= st.victoryTarget); assert(st.round > 10, 'A 40-point game takes many rounds');
  assert(st.players.some(p => p.cardsPurchased >= 3), 'Rivals buy market cards'); assert(st.players.some(p => (p.storagePurchases || 0) >= 1), 'Rivals still buy Capacity Modules; relic capacity can replace that investment for others'); assert(st.players.some(p => (p.storageUpgrades || 0) >= 1), 'Rivals still play purchased Capacity Modules');
}
console.log('Capacity Cards: 34 retained stable ids including three draw-two cards within starting limits, nine-card tiered market, military deck purchases, Buy cards and Wonders, one-step orders, printed Construct discounts, Capacity Module purchase and play, rival capacity targeting and a full 40-point rival game passed.');
