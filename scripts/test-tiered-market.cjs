// Rules #market: the market is three decks by total printed price (Expensive 8+, Medium 6-7,
// Cheap up to 5), each with three face-up slots. A bought slot refills in place from its own
// deck; once that deck runs out the slot stays empty.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'prototypes/galactic-reach', file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function game(seed = 1729) {
  const context = vm.createContext({});
  vm.runInContext(read('adapter.js') + read('app.js'), context);
  let e;
  const factory = context.createGalacticAdapter;
  context.createGalacticAdapter = port => { e = port; return factory(port); };
  const a = context.createGalacticReach({ headless: true, random: () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32) });
  return { e, a, s: e.state, p: e.state.players[0] };
}
const price = cost => Object.values(cost).reduce((sum, n) => sum + n, 0);
const tiers = ['expensive', 'medium', 'cheap'];
const rich = p => { p.resourceLimits = { matter: 30, energy: 30, biomass: 30, data: 30 }; p.resources = { matter: 30, energy: 30, biomass: 30, data: 30 }; };
const startBuy = g => { Object.assign(g.s, { phase: 'buy', activePlayer: 0 }); g.p.passed = true; rich(g.p); };

// The split: every design's tier follows its total price, and the table order is Expensive, Medium, Cheap.
{
  const { e } = game();
  assert.deepEqual(plain(e.MARKET_TIERS.map(t => t.id)), tiers, 'Rows read Expensive, Medium, Cheap below the relics');
  const designs = Object.keys({ ...e.ALL_CARDS }).filter(key => e.MARKET_CARDS[key]);
  const split = Object.fromEntries(tiers.map(t => [t, designs.filter(key => e.marketTier(key) === t).sort()]));
  for (const key of designs) {
    const total = price(e.MARKET_CARDS[key].cost);
    assert.equal(e.marketTier(key), total >= 8 ? 'expensive' : total >= 6 ? 'medium' : 'cheap', key);
  }
  assert.deepEqual(split.cheap, ['deflectorGrid', 'ionThrusters', 'prefabYards', 'procurementHub', 'railBattery', 'seedArk', 'signalRelay', 'slipstreamCharts', 'surveyNetwork', 'tacticalBriefing']);
  assert.deepEqual(split.medium, ['archivePurge', 'cargoExpansion', 'colonyPods', 'flakScreen', 'hardlightBulwark', 'strategyCore', 'strikeVector', 'torpedoSpread']);
  assert.deepEqual(split.expensive, ['aegisLattice', 'ascendancyCodex', 'commandNexus', 'dysonLattice', 'foldSpaceGate', 'genesisCharter', 'hyperspaceVaults', 'monumentOfAccord', 'novaBarrage', 'phaseLance', 'torpedoBarrage', 'victoryDoctrine', 'worldEngine']);
}

// Setup: three decks of two copies per design, three face-up cards from each, in row order.
{
  const { s, e } = game();
  assert.equal(s.market.length, 9, 'Nine market cards: three rows of three');
  assert.deepEqual(plain(s.market.map(c => e.marketTier(c.key))), ['expensive', 'expensive', 'expensive', 'medium', 'medium', 'medium', 'cheap', 'cheap', 'cheap']);
  assert.deepEqual(Object.keys(s.marketDecks), tiers);
  assert.deepEqual(plain(Object.fromEntries(tiers.map(t => [t, s.marketDecks[t].length]))), { expensive: 23, medium: 13, cheap: 17 });
  for (const t of tiers) assert(s.marketDecks[t].every(c => e.marketTier(c.key) === t), `the ${t} deck holds only ${t} cards`);
  const supply = [...s.market, ...Object.values(s.marketDecks).flat()].map(c => c.key);
  assert.equal(supply.length, 62);
  for (const key of Object.keys(e.MARKET_CARDS)) assert.equal(supply.filter(k => k === key).length, 2, `${key}: two copies`);
  assert(!('advancedDeck' in s) && !('marketDiscard' in s), 'The single mixed supply is gone');
}

// A purchase refills its own slot from its own deck; the other eight cards stay where they were.
for (const at of [0, 4, 8]) {
  const g = game(), { s, e } = g; startBuy(g);
  const tier = e.marketTier(s.market[at].key), next = s.marketDecks[tier].at(-1), before = plain(s.market);
  const action = g.a.legalActions(0).find(a => a.type === 'buy' && a.index === at);
  assert(action, `slot ${at} can be bought`); g.a.applyAction(0, action);
  assert.equal(s.market.length, 9);
  assert.equal(s.market[at].id, next.id, `slot ${at} refills from the top of the ${tier} deck`);
  assert.deepEqual(plain(s.market).filter((_, i) => i !== at), before.filter((_, i) => i !== at), 'other slots do not move');
}

// An empty tier deck leaves its slot empty; no card moves in from another tier.
{
  const g = game(), { s, e } = g; startBuy(g);
  s.marketDecks.cheap = [];
  const others = { expensive: s.marketDecks.expensive.length, medium: s.marketDecks.medium.length };
  const bought = s.market[7];
  g.a.applyAction(0, g.a.legalActions(0).find(a => a.type === 'buy' && a.index === 7));
  assert(g.p.discard.some(c => c.id === bought.id) || g.p.military.some(c => c.id === bought.id));
  assert.equal(s.market.length, 8);
  assert.deepEqual(plain(s.market.map(c => e.marketTier(c.key))), ['expensive', 'expensive', 'expensive', 'medium', 'medium', 'medium', 'cheap', 'cheap']);
  assert.deepEqual({ expensive: s.marketDecks.expensive.length, medium: s.marketDecks.medium.length }, others, 'other decks are untouched');
  // Buy out the rest of the Cheap row: the Expensive and Medium rows still refill.
  while (s.market.some(c => e.marketTier(c.key) === 'cheap')) {
    const index = s.market.findIndex(c => e.marketTier(c.key) === 'cheap');
    g.a.applyAction(0, g.a.legalActions(0).find(a => a.type === 'buy' && a.index === index));
  }
  assert.equal(s.market.length, 6, 'The Cheap row is empty');
  g.a.applyAction(0, g.a.legalActions(0).find(a => a.type === 'buy' && a.index === 0));
  assert.equal(s.market.length, 6, 'The Expensive row still refills');
}

// Shared tables: each tier deck's order is hidden but its size is public; a reveal stops Undo.
{
  const g = game(), { s, a } = g; startBuy(g);
  const view = plain(a.privateState(1));
  for (const t of tiers) {
    assert.equal(view.marketDecks[t].length, s.marketDecks[t].length);
    assert(view.marketDecks[t].every(c => c.hidden === true && !c.key), `the ${t} deck's order stays hidden`);
  }
  const mark = () => plain(a.undoMark()).reveal.market;
  const before = mark();
  a.applyAction(0, a.legalActions(0).find(x => x.type === 'buy' && x.index === 0));
  assert.equal(mark(), before - 1, 'Turning up a refill is a reveal');
  s.marketDecks.medium = [];
  const still = mark();
  a.applyAction(0, a.legalActions(0).find(x => x.type === 'buy' && x.index === 3));
  assert.equal(mark(), still, 'An empty slot reveals nothing');
}

// Rivals shop every row: the observation lists all nine cards with their printed prices.
{
  const g = game(), { s, a } = g;
  const view = plain(a.observe(1));
  assert.equal(view.market.length, 9); assert.equal(view.marketCosts.length, 9);
  startBuy(g);
  const keys = new Set(a.legalActions(0).filter(x => x.type === 'buy' && x.source === 'market').map(x => x.index));
  assert.deepEqual([...keys].sort(), [0, 1, 2, 3, 4, 5, 6, 7, 8], 'A rich faction may buy from any row');
  assert.equal(s.round, 1);
}

console.log('Tiered market: price split 10/8/13 designs, Expensive/Medium/Cheap rows of three, in-place refills from each tier deck, empty slots when a deck runs out, hidden tier decks with public sizes and Undo reveals passed.');
