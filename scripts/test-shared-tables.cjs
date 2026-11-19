// Shared tables (rulebook #shared-tables): every shuffle comes from the table's
// authority, the same orders rebuild the same game, and a seat's private view
// never carries another seat's hidden cards.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'prototypes/galactic-reach/adapter.js'), 'utf8')
  + fs.readFileSync(path.join(root, 'prototypes/galactic-reach/app.js'), 'utf8');

function engine(shuffle) {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const createAdapter = context.createGalacticAdapter;
  let port;
  context.createGalacticAdapter = e => { port = e; return createAdapter(e); };
  const adapter = context.createGalacticReach({headless: true, shuffle, names: ['Ada', 'Bo', 'Violet', 'Helios'], controllers: ['human', 'human', 'ai', 'ai'],
    random: () => { throw new Error('A shared table must not draw its own randomness.'); }});
  return {adapter, port};
}
// Values cross vm realms, so compare plain JSON copies.
const plain = value => JSON.parse(JSON.stringify(value));
function seeded(seed) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}
// An authority that records each order it hands out.
function recorder(seed) {
  const random = seeded(seed), log = [];
  const shuffle = (n, purpose) => {
    const order = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    log.push({n, purpose, order});
    return order;
  };
  return {shuffle, log};
}
// Folding the log: hands back recorded orders and checks each request matches.
function replayer(log) {
  let next = 0;
  return (n, purpose) => {
    const entry = log[next++];
    assert(entry, 'The game asked for a shuffle the log does not have.');
    assert.deepEqual([entry.n, entry.purpose], [n, purpose]);
    return entry.order;
  };
}

const live = recorder(42), game = engine(live.shuffle);
assert.equal(live.log.length, 19, 'Setup shuffles the map, four starting decks, the three market tier decks and the relics.');
assert.deepEqual(live.log.filter(e => e.purpose.startsWith('market-deck')).map(e => e.purpose), ['market-deck:expensive', 'market-deck:medium', 'market-deck:cheap']);
assert.deepEqual(live.log.filter(e => e.purpose.startsWith('deck:')).map(e => e.purpose), ['deck:0', 'deck:1', 'deck:2', 'deck:3']);
assert.equal(game.port.state.players[0].name, 'Ada');
assert.equal(game.port.state.players[2].controller, 'ai');

// Play a few hundred decisions, logging each action like the table service does.
const actions = [];
const pick = seeded(7);
for (let i = 0; i < 400 && game.adapter.activeSeat() !== null; i++) {
  const seat = game.adapter.activeSeat(), legal = game.adapter.legalActions(seat);
  const action = legal.find(a => a.type === 'resource') || legal[Math.floor(pick() * legal.length)];
  game.adapter.applyAction(seat, action);
  actions.push([seat, action]);
}
assert(game.port.state.round > 1, 'Several rounds were played, including reshuffles.');
assert(live.log.some(e => e.purpose.startsWith('deck:') && live.log.indexOf(e) >= 19), 'A discard reshuffle came from the authority.');

const folded = engine(replayer(live.log));
for (const [seat, action] of actions) folded.adapter.applyAction(seat, action);
for (const seat of [0, 1, 2, 3]) assert.deepEqual(plain(folded.adapter.privateState(seat)), plain(game.adapter.privateState(seat)), `fold(log) rebuilds seat ${seat}'s view`);

// Private views.
const state = game.port.state;
for (const seat of [0, 1]) {
  const view = plain(game.adapter.privateState(seat)), other = 1 - seat;
  assert.deepEqual(view.players[other].hand, []);
  assert.equal(view.players[other].handCount, state.players[other].hand.length);
  assert.deepEqual(view.players[other].deck, []);
  assert.equal(view.players[other].deckCount, state.players[other].deck.length);
  const hidden = JSON.stringify(view);
  for (const card of [...state.players[other].hand, ...state.players[other].deck]) assert(!hidden.includes(`"${card.id}"`), `seat ${seat} cannot see ${card.id}`);
  assert.deepEqual(Object.keys(view.marketDecks), ['expensive', 'medium', 'cheap']);
  for (const [tier, deck] of Object.entries(view.marketDecks)) assert.equal(deck.length, state.marketDecks[tier].length, `the ${tier} deck's size is public`);
  for (const card of [...state.relicDeck, ...Object.values(state.marketDecks).flat()]) assert(!hidden.includes(`"${card.id}"`), 'pile order stays hidden');
  assert.deepEqual(view.players[seat].hand, plain(state.players[seat].hand), 'a seat sees its own hand');
  assert.deepEqual(view.players[seat].deck.map(c => c.id).sort(), state.players[seat].deck.map(c => c.id).sort(), 'and its deck contents');
  const keys = view.players[seat].deck.map(c => c.key);
  assert.deepEqual(keys, [...keys].sort(), 'but not their order');
  for (const cluster of view.clusters) assert(cluster.scannedBy.every(id => id === seat), 'other seats\' relic signals stay private');
  for (const [coord, planet] of Object.entries(state.planets)) {
    const cluster = state.clusters[planet.cluster];
    if (cluster.kind === 'moon' && !cluster.revealedBy.includes(seat) && !cluster.scannedBy.includes(seat)) assert(!(coord in view.planets), 'unrevealed moons stay hidden');
    if (planet.special === 'relic' && !cluster.scannedBy.includes(seat) && view.planets[coord]) assert.equal(view.planets[coord].special, null, 'unlocated relic sectors stay hidden');
  }
}
// An opponent's committed combat tactic stays hidden until both reveal.
state.pendingCombat = {attackerId: 0, defenderId: 1, commitments: {attacker: 'concentratedFire', defender: null}};
assert.equal(game.adapter.privateState(1).pendingCombat.commitments.attacker, 'hidden');
assert.equal(game.adapter.privateState(0).pendingCombat.commitments.attacker, 'concentratedFire');
state.pendingCombat = null;

// Undo marks (rulebook #shared-tables): a conversion stays inside the turn and
// reveals nothing; passing starts a new turn.
{
  const fresh = engine(recorder(9).shuffle), seat = fresh.adapter.activeSeat();
  const before = plain(fresh.adapter.undoMark());
  const convert = plain(fresh.adapter.legalActions(seat)).find(a => a.type === 'resource');
  fresh.adapter.applyAction(seat, convert);
  const after = plain(fresh.adapter.undoMark());
  assert.equal(after.turn, before.turn, 'a conversion keeps the turn');
  assert.deepEqual(after.reveal, before.reveal, 'and reveals nothing');
  fresh.adapter.applyAction(seat, {type: 'pass'});
  assert(plain(fresh.adapter.undoMark()).turn > before.turn, 'passing starts the Buy turn');
}

// Snapshots (docs/shared-tables.md): a game resumed from snapshotState() plays
// on exactly like the original, card ids and turn counter included.
{
  const auth = recorder(21), original = engine(auth.shuffle), pick = seeded(3);
  const step = g => { const seat = g.adapter.activeSeat(); const legal = g.adapter.legalActions(seat); const a = plain(legal.find(x => x.type === 'resource') || legal[Math.floor(pick() * legal.length)]); return [seat, a]; };
  for (let i = 0; i < 150 && original.adapter.activeSeat() !== null; i++) { const [seat, a] = step(original); original.adapter.applyAction(seat, a); }
  const snapshot = plain(original.adapter.snapshotState()), used = auth.log.length;
  const context = vm.createContext({}); vm.runInContext(source, context);
  let next = used; const resumed = context.createGalacticReach({headless: true, resume: snapshot, names: ['Ada', 'Bo', 'Violet', 'Helios'], controllers: ['human', 'human', 'ai', 'ai'],
    shuffle: (n, purpose) => { const e = auth.log[next++]; assert.deepEqual([e.n, e.purpose], [n, purpose]); return e.order; }, random: () => { throw new Error('no randomness'); }});
  for (let i = 0; i < 150 && original.adapter.activeSeat() !== null; i++) {
    const [seat, a] = step(original);
    original.adapter.applyAction(seat, a); resumed.applyAction(seat, a);
  }
  for (const seat of [0, 1]) assert.deepEqual(plain(resumed.privateState(seat)), plain(original.adapter.privateState(seat)), 'a resumed game matches the original');
  assert.equal(plain(resumed.undoMark()).turn, plain(original.adapter.undoMark()).turn);
  assert.throws(() => context.createGalacticReach({headless: true, resume: {...snapshot, state: {...snapshot.state, version: 1}}}), /other rules/);
}

console.log('Shared table authority, fold, private views, undo marks and snapshots passed.');

// Public tablet DTO: all hidden identities and new/unreviewed fields stay out.
{
  const {adapter,port}=engine(recorder(37).shuffle), state=port.state;
  const sentinel='PRIVATE_SENTINEL_NEVER_ON_BOARD';
  state.privateFutureField=sentinel;state.players.forEach(p=>{p.privateFutureField=sentinel;p.buyStartHandIds=[sentinel];});
  const moon=state.clusters.find(c=>c.kind==='moon');
  moon.scannedBy=[0];moon.privateFutureField=sentinel;
  const world=state.clusters.find(c=>c.kind==='world'&&c.scannedBy.length===0);
  world.scannedBy=[0];
  const signal=world.coords.find(k=>state.planets[k].special==='relic');
  let view=plain(adapter.publicState());
  assert(!JSON.stringify(view).includes(sentinel),'allowlist rejects new hidden fields');
  assert(!Object.hasOwn(view.planets,moon.center),'a private probe must not reveal a moon');
  assert.equal(view.planets[signal].relic,false,'one faction’s signal stays private');
  for(const p of state.players)for(const c of [...p.hand,...p.deck])assert(!JSON.stringify(view).includes(c.id),'no hidden card identity');
  assert(view.players.every(p=>!('hand' in p)&&!('deck' in p)&&!('buyStartHandIds' in p)));
  moon.revealedBy=[0,1,2,3];
  assert(adapter.publicState().planets[moon.center],'a surveyed moon is public');
  state.pendingCombat={coord:'0,0',origin:'1,0',stage:'tactic',volley:0,attackerId:0,defenderId:1,options:{},
    attackerPieces:[],defenderPieces:[],used:{attacker:[],defender:[]},hands:{attacker:{concentratedFire:2},defender:{defensiveScreen:2}},
    commitments:{attacker:sentinel,defender:null},escapeDone:{attacker:true,defender:true},summary:[],volleys:[]};
  view=plain(adapter.publicState());
  assert.equal(view.combat.sides.attacker.committed,true);
  assert(!JSON.stringify(view).includes(sentinel),'committed tactic is never public');
  assert(!('hand' in view.combat.sides.attacker)&&!('choice' in view.combat.sides.attacker));
  state.pendingCombat=null;state.winner=0;
  view=plain(adapter.publicState());
  assert(view.players.every(p=>!('hand' in p)&&!('deck' in p)),'finishing does not disclose hands to board');
}
console.log('Public board privacy passed.');
