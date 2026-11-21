// Learn to play's saved place (prototypes/galactic-reach/tutorial.js, docs/rules/tutorial.md):
// choosing Learn to play resumes only a walkthrough left part-way; otherwise it deals the practice
// game again before app.js reads it. Reloads keep the walkthrough, the guest save is never
// touched, unreadable stored data never breaks the page, and a restart in another tab is followed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../prototypes/galactic-reach/tutorial.js'), 'utf8');
const PROGRESS = 'galactic-reach-tutorial-progress-v1';
const RULES = /const RULES = '([^']+)'/.exec(source)[1];
const PRACTICE = ['galactic-reach-tutorial-save-v38', 'galactic-reach-tutorial-history-v38', 'galactic-reach-tutorial-turn-history-v38'];
const GUEST = ['galactic-reach-save-v38', 'galactic-reach-history-v38', 'galactic-reach-turn-history-v38', 'galactic-reach-guide-v1'];

// localStorage keeps its entries as own enumerable keys: tutorial.js lists them with Object.keys.
function storage(entries, { blocked = false } = {}) {
  const store = {};
  const method = fn => ({ value: blocked ? () => { throw new Error('blocked'); } : fn });
  Object.defineProperties(store, {
    getItem: method(key => (Object.hasOwn(store, key) ? store[key] : null)),
    setItem: method((key, value) => { store[key] = String(value); }),
    removeItem: method(key => { delete store[key]; }),
  });
  Object.assign(store, entries);
  return store;
}

function open({ entries = {}, navigation = 'navigate', search = '?tutorial=1', blocked = false, performance } = {}) {
  const localStorage = storage(entries, { blocked });
  const listeners = {};
  let reloads = 0;
  const element = { classList: { add() {} }, addEventListener() {}, hidden: false, textContent: '' };
  const context = {
    URLSearchParams, JSON, Number, Object, Math, Boolean, String, Array,
    localStorage,
    location: { search, pathname: '/galactic-reach/', reload: () => { reloads += 1; } },
    performance: performance !== undefined ? performance : { getEntriesByType: type => (type === 'navigation' && navigation ? [{ type: navigation }] : []) },
    document: { readyState: 'complete', title: 'Heirs Ad Astra', body: element, querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return { context, localStorage, keys: () => Object.keys(localStorage).sort(), fire: (type, event) => (listeners[type] || []).forEach(fn => fn(event)), reloads: () => reloads };
}

const practice = progress => ({
  [PROGRESS]: typeof progress === 'string' ? progress : JSON.stringify({ rules: RULES, view: progress.step, base: null, staged: { 'first-construct': true }, cardFirst: true, ...progress }),
  ...Object.fromEntries(PRACTICE.map(key => [key, '{"round":2}'])),
  ...Object.fromEntries(GUEST.map(key => [key, '{"guest":true}'])),
});
const guestOnly = GUEST.slice().sort();
const everything = [...GUEST, ...PRACTICE, PROGRESS].sort();

// A walkthrough still on its first step (the player may have played on, Lesson 1 never advanced):
// choosing Learn to play deals the practice game again, as its "Learn to play" label promises.
{
  const page = open({ entries: practice({ step: 0, stepId: 'first-construct' }) });
  assert.deepEqual(page.keys(), guestOnly, 'a new walkthrough must not inherit the earlier practice table');
  assert.equal(page.context.galacticReachTutorial.progress().step, 0);
  assert.equal(JSON.stringify(page.context.galacticReachTutorial.progress().staged), '{}', 'the opening hand is staged again');
}
// A finished walkthrough: Learn to play starts it again.
assert.deepEqual(open({ entries: practice({ step: 36, stepId: 'finished' }) }).keys(), guestOnly);
// Left part-way ("Continue Learn to play"): the place and the practice game are resumed.
{
  const page = open({ entries: practice({ step: 8, stepId: 'convert-rest' }) });
  assert.deepEqual(page.keys(), everything);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'convert-rest');
}
// A place saved at Lesson 1's former second step (its Move conversion, now part of the first step)
// was left part-way: it resumes on the same practice game, at Lesson 1.
{
  const page = open({ entries: practice({ step: 1, stepId: 'convert-move' }) });
  assert.deepEqual(page.keys(), everything);
  // The smallest table the first step reads: your Move not yet converted (no Energy).
  page.context.galacticReachGuide = { handCard: () => null, hex: () => null, turnButton: () => null };
  const player = { resources: { matter: 1, energy: 0, biomass: 1, data: 1 }, hand: [], deck: [], discard: [], inPlay: [] };
  const state = { tutorialRules: RULES, pendingCombat: null, phase: 'operations', activePlayer: 0, winner: null, players: [player], planets: {}, clusters: [], fleets: {} };
  const tip = page.context.galacticReachTutorial.tip({ state, structures: { harvester: { cost: { energy: 1 } } }, turnSerial: () => 1, stage: () => true }, null);
  assert.match(tip.eyebrow, /^Lesson 1 of /);
  assert.equal(page.context.galacticReachTutorial.progress().stepId, 'first-construct');
}
// A place saved before steps were named still resumes.
assert.deepEqual(open({ entries: practice({ step: 3, stepId: undefined }) }).keys(), everything);
// A reload or Back/Forward keeps the same walkthrough, even on its first step or once finished.
for (const navigation of ['reload', 'back_forward']) {
  assert.deepEqual(open({ entries: practice({ step: 0, stepId: 'first-construct' }), navigation }).keys(), everything, navigation);
  assert.deepEqual(open({ entries: practice({ step: 36, stepId: 'finished' }), navigation }).keys(), everything, navigation);
}
// Browsers without navigation timing treat the page as newly chosen.
assert.deepEqual(open({ entries: practice({ step: 0 }), performance: null }).keys(), guestOnly);
assert.deepEqual(open({ entries: practice({ step: 0 }), performance: { getEntriesByType: () => { throw new Error('unsupported'); } } }).keys(), guestOnly);
// Unreadable or older stored places cannot be resumed: the page still loads and starts clean.
for (const stored of ['{not json', 'null', '5', '"text"', '[]', '{"step":"8"}', '{"step":-1}', '{"step":1.5}']) {
  const page = open({ entries: practice(stored) });
  assert.deepEqual(page.keys(), guestOnly, stored);
  assert.equal(page.context.galacticReachTutorial.progress().step, 0, stored);
}
// Blocked storage never stops the walkthrough from loading.
assert.equal(open({ entries: {}, blocked: true }).context.galacticReachTutorial.active, true);
// Outside Learn to play nothing is read, cleared or watched, whatever is saved.
{
  const page = open({ entries: practice({ step: 0 }), search: '' });
  assert.equal(page.context.galacticReachTutorial.active, false);
  assert.deepEqual(page.keys(), everything);
  page.fire('storage', { key: PROGRESS, newValue: null });
  assert.equal(page.reloads(), 0);
}
// Another tab restarted the walkthrough (its place removed): this tab reloads onto the new one
// instead of writing the old practice game back. Its ordinary saves do not reload it.
{
  const page = open({ entries: practice({ step: 12, stepId: 'shipyard-aim' }) });
  page.fire('storage', { key: PROGRESS, newValue: JSON.stringify({ step: 13 }) });
  page.fire('storage', { key: 'galactic-reach-tutorial-save-v38', newValue: null });
  page.fire('storage', { key: 'galactic-reach-save-v38', newValue: null });
  assert.equal(page.reloads(), 0);
  page.fire('storage', { key: PROGRESS, newValue: null });
  assert.equal(page.reloads(), 1);
}

// The smallest table Lessons 1 to 3 read: a home Colony with an empty Data hex beside it, your
// Move converted, a Construct in hand. `stagings` counts every change the walkthrough makes to it.
function table(page) {
  page.context.galacticReachGuide = { handCard: id => ({ card: id }), hex: coord => ({ hex: coord }), turnButton: () => ({ button: 'turn' }) };
  const player = { resources: { matter: 2, energy: 1, biomass: 1, data: 2 }, hand: [{ id: 'construct-4', key: 'construct' }], deck: [], discard: [], inPlay: [] };
  const state = {
    tutorialRules: RULES, pendingCombat: null, phase: 'operations', activePlayer: 0, winner: null, round: 1, victoryTarget: 40, players: [player], fleets: {},
    planets: { '0,0': { cluster: 0, owner: 0, hasColony: true, type: 'matter', upgrade: null }, '1,0': { cluster: 0, owner: null, hasColony: false, type: 'data', upgrade: null } },
    clusters: [{ id: 0, kind: 'home', center: '0,0', coords: ['0,0', '1,0'] }],
  };
  const port = { state, stagings: 0, structures: { harvester: { cost: { matter: 1, energy: 1, data: 1 } } }, turnSerial: () => 1, stage: () => { port.stagings += 1; return true; } };
  return port;
}
// What a note lights on the table: a ring, a goal ring, a ghost drag or callouts, a pointer, the card cue.
const lit = tip => ['anchor', 'marks', 'show', 'followCallouts', 'revealOnInspect', 'bringIntoView']
  .filter(key => (Array.isArray(tip[key]) ? tip[key].some(Boolean) : Boolean(tip[key])));

// Back shows a finished step's note and lights nothing on the table: its action is done, so no
// ring, goal ring or ghost drag invites it again. The note holds its place, says it is a look back,
// and offers the way back to the current step. Next walks forward to it without staging anything.
{
  const page = open({ entries: practice({ step: 3, stepId: 'track' }) });
  const tutorial = page.context.galacticReachTutorial, port = table(page);
  assert.equal(tutorial.tip(port, null).id, 'track');
  for (const id of ['harvester-build', 'harvester-aim', 'first-construct']) {
    tutorial.coachAction('back');
    const tip = tutorial.tip(port, null);
    assert.equal(tip.id, id);
    assert.match(tip.eyebrow, / · done$/, id);
    assert.deepEqual(lit(tip), [], `reviewing ${id} lights nothing`);
    assert.equal(tip.hold, true, `reviewing ${id} keeps the note in place`);
    assert.match(tip.aside, /Looking back/, id);
    assert.deepEqual([...tip.buttons.map(b => b.action)], ['back', 'next', 'resume', 'exit', 'skip'], id);
  }
  for (const id of ['harvester-aim', 'harvester-build', 'track']) {
    tutorial.coachAction('next');
    assert.equal(tutorial.tip(port, null).id, id);
    assert.equal(tutorial.progress().step, 3, 'Next through review never re-enters a finished step');
  }
  assert.equal(tutorial.progress().view, 3);
  assert.equal(port.stagings, 0, 'Next through review stages nothing again');
  assert.equal(JSON.stringify(tutorial.progress().staged), JSON.stringify({ 'first-construct': true }));
  // Return to current step goes straight back from any earlier step.
  tutorial.coachAction('back'); tutorial.coachAction('back');
  tutorial.coachAction('resume');
  assert.equal(tutorial.tip(port, null).id, 'track');
  assert.equal(port.stagings, 0);
}
// Reloading while reviewing returns to the current step, not the one being looked at.
for (const navigation of ['reload', 'back_forward', 'navigate']) {
  const page = open({ entries: practice({ step: 3, stepId: 'track', view: 1 }), navigation });
  assert.equal(page.context.galacticReachTutorial.progress().view, 3, navigation);
  assert.equal(page.context.galacticReachTutorial.tip(table(page), null).id, 'track', navigation);
}
// Doing the current step's action while looking back still counts: the review ends at the step it reaches.
{
  const page = open({ entries: practice({ step: 1, stepId: 'harvester-aim' }) });
  const tutorial = page.context.galacticReachTutorial, port = table(page);
  assert.equal(tutorial.tip(port, null).id, 'harvester-aim');
  tutorial.coachAction('back');
  assert.equal(tutorial.tip(port, null).id, 'first-construct');
  Object.assign(port.state.planets['1,0'], { owner: 0, upgrade: 'harvester' });
  assert.equal(tutorial.tip(port, null).id, 'track');
  assert.equal(tutorial.progress().view, tutorial.progress().step);
}
console.log('Learn to play progress: new walkthroughs start clean, part-way places resume, reloads keep their place, guest saves and unreadable data are safe, other tabs follow a restart, Back reviews without lighting anything, a reload or the current action ends a review.');
