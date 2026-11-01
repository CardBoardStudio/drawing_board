// Replay viewer: what the live UI shows for a recorded match must match the engine at every decision.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const { renameFactions, analyse, stateAt } = require('../prototypes/galactic-reach/replay.js');

// Mirrors crates/galactic-reach/src/replay.rs: initial observer state plus structural deltas.
function diff(before, after, at, out) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (object(before) && object(after)) {
    for (const key of Object.keys(before)) if (!(key in after)) out.push({ path: [...at, key], remove: true });
    for (const [key, value] of Object.entries(after)) {
      if (key in before) diff(before[key], value, [...at, key], out);
      else out.push({ path: [...at, key], value });
    }
  } else if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    after.forEach((value, index) => diff(before[index], value, [...at, index], out));
  } else out.push({ path: at, value: after });
}

// An authoritative headless match. The agent favours rare decisions so one match covers
// Colonize II bonus builds, open trades, combat, purchases, and upgrades.
const context = vm.createContext({});
vm.runInContext(read('prototypes/galactic-reach/adapter.js') + read('crates/galactic-reach/rules/replay-view.js') + read('prototypes/galactic-reach/app.js'), context);
const factory = context.createGalacticAdapter;
let engine, seed = 4242;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
context.createGalacticAdapter = e => { engine = e; return factory(e); };
const game = context.createGalacticReach({ headless: true, random });
const weight = { colony_build: 60, colonize: 60, trade_accept: 25, trade_offer: 3, upgrade: 20, build: 8, move: 8, buy: 6, probe: 2, pass: .3, finish_buy: 1, finish_colony_build: .5 };
// JSON copies: vm-realm arrays would fail strict deep equality on their prototypes.
const truth = state => JSON.parse(JSON.stringify({
  pending: state.pendingColonyBuild ? { playerId: state.pendingColonyBuild.playerId, colony: state.pendingColonyBuild.colony } : null,
  tradesWith: state.players.map(p => [...p.tradesWith]),
  cardsPurchased: state.players.map(p => p.cardsPurchased || 0),
}));
const views = [JSON.parse(JSON.stringify(game.replayView()))];
const truths = [truth(engine.state)];
const frames = [];
for (let n = 0; n < 1800 && game.activeSeat() !== null; n++) {
  const seat = game.activeSeat();
  const legal = game.legalActions(seat);
  const total = legal.reduce((sum, a) => sum + (weight[a.type] ?? 1), 0);
  let pick = random() * total, action = legal.at(-1);
  for (const a of legal) { pick -= weight[a.type] ?? 1; if (pick <= 0) { action = a; break; } }
  game.applyAction(seat, action);
  const view = JSON.parse(JSON.stringify(game.replayView()));
  const changes = [];
  diff(views.at(-1), view, [], changes);
  frames.push({ seat, action, round: view.round, phase: view.phase, changes });
  views.push(view);
  truths.push(truth(engine.state));
}
const data = { format: 1, initial: views[0], frames };

// The browser's own presentation helpers, reached the same way as test-long-reach.cjs.
const source = read('prototypes/galactic-reach/app.js');
const boot = source.indexOf('\n  if (headless) {\n    state = newState();');
assert(boot > 0, 'Locate the browser bootstrap before instrumenting the replay helpers');
const ui = vm.createContext({ module: { exports: {} }, document: { querySelector: () => ({}), querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, console });
vm.runInContext(source.slice(0, boot) + '\n  return { describeDecision, replayState, calculatePrestige, playerCapacity };\n}\n', ui);
const view = ui.createGalacticReach({ replay: true });

const names = ['Vanguard', 'Architect <b>', 'You', 'Ember Directorate'];
const analysis = analyse(data, view.describeDecision, names);
assert.equal(analysis.steps.length, frames.length + 1);
const seen = { pending: 0, trades: 0, combat: 0, buys: 0, upgraded: 0 };
for (let index = 0; index <= frames.length; index++) {
  const step = analysis.steps[index];
  const raw = stateAt(data, analysis, index);
  if (index % 5 === 0 || step.pendingColonyBuild || step.decision?.combat) assert.deepEqual(raw, views[index], `Replay deltas rebuild decision ${index}`);
  assert.deepEqual(step.pendingColonyBuild, truths[index].pending, `Pending Colonize II at decision ${index}`);
  assert.deepEqual(step.tradesWith, truths[index].tradesWith, `Completed trades at decision ${index}`);
  assert.deepEqual(step.cardsPurchased, truths[index].cardsPurchased, `Purchased cards at decision ${index}`);
  assert.equal(step.log.length, raw.log.length);
  if (index > 0 && raw.log[0] !== views[index - 1].log[0]) assert.equal(step.log[0], renameFactions(raw.log[0], names, frames[index - 1].seat), `Newest log line at decision ${index}`);
  view.replayState(raw, { names, cardsPurchased: step.cardsPurchased, tradesWith: step.tradesWith, pendingColonyBuild: step.pendingColonyBuild, decision: step.decision });
  raw.players.forEach((player, seat) => assert.equal(view.calculatePrestige(seat), player.prestige, `Prestige for seat ${seat} at decision ${index}`));
  if (step.decision) {
    assert.match(step.decision.text, /^[^]+$/);
    assert.doesNotMatch(step.decision.text, /undefined|NaN|\[object/, `Decision ${index}: ${step.decision.text}`);
  }
  if (step.pendingColonyBuild) seen.pending++;
  if (frames[index]?.action.type === 'trade_accept') seen.trades++;
  if (step.decision?.combat) seen.combat++;
  if (frames[index]?.action.type === 'buy') seen.buys++;
  if (raw.players.some(p => p.hand.some(card => card.upgraded))) seen.upgraded++;
}
for (const [kind, count] of Object.entries(seen)) assert(count > 0, `The recorded match should cover ${kind}`);
assert(frames.some(frame => frame.action.type === 'colony_build' || frame.action.type === 'finish_colony_build'));
const rounds = [...analysis.rounds];
assert.deepEqual(rounds[0], [data.initial.round, 0]);
rounds.slice(1).forEach(([round, step]) => assert.equal(frames[step - 1].round, round));

// Log lines name the match's AI players. Rules text that opens with "You" describes the acting seat.
const people = ['Ann', 'Bo', 'Cy', 'Di'];
assert.equal(renameFactions('R3 · You used Industrial Surge on 2 planets.', people, 2), 'R3 · Cy used Industrial Surge on 2 planets.');
assert.equal(renameFactions('R3 · You attacked Ember Directorate at Orion. Your fleet was destroyed.', people, 0), 'R3 · Ann attacked Bo at Orion. Ann’s fleet was destroyed.');
assert.equal(renameFactions('R2 · Violet Assembly accepted You’s open offer.', people, 2), 'R2 · Cy accepted Ann’s open offer.');
assert.equal(renameFactions('R4 · Helios Compact attacked You at Vega.', people, 3), 'R4 · Di attacked Ann at Vega.');
assert.equal(renameFactions('R1 · You passed for the rest of Operations.', ['Helios Compact', 'You', 'b', 'c'], 0), 'R1 · Helios Compact passed for the rest of Operations.');

// Presentation-only replay state never touches rules: no market, deck order, or military deck leaks.
const final = view.replayState(stateAt(data, analysis, frames.length), { names, cardsPurchased: [0, 0, 0, 0], tradesWith: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] });
assert.equal(final.market.length, 0);
assert(final.players.every(player => player.deck === undefined && player.militaryDeck === undefined));
console.log(`Replay view: ${frames.length} recorded decisions rebuild the live UI state, Colonize II, trades, purchases, Prestige, and named logs exactly.`);
