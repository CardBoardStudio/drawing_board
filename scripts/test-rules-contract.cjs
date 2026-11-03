const assert = require('node:assert/strict');
const { validate, ruleBearing, RULEBOOK } = require('./check-rules-contract.cjs');
const rulebook = '<section id="round"></section>';
const body = '## Rules grounding\n[Round](prototypes/galactic-reach/rulebook.html#round): preserve alternating operations.\n\n## Gameplay impact\nNone: presentation changes preserve all actions and saved-state meaning.\n\n## Verification\nChecks run.';
const run = (files, text = body) => validate({ files, body: text, rulebook });
assert.deepEqual(run(['prototypes/galactic-reach/styles.css']), []);
for (const path of ['prototypes/galactic-reach/app.js', 'prototypes/galactic-reach/adapter.js', 'crates/galactic-reach/src/lib.rs', 'crates/galactic-reach/rules/v5-app.js', 'crates/server/src/tables.rs', 'crates/server/src/arena.rs', 'crates/game-core/src/lib.rs']) {
  assert(ruleBearing(path), path);
  assert(run([path]).some(e => e.includes('meaningful update')), path);
  assert.deepEqual(run([path, RULEBOOK]), [], path);
}
assert(run(['new-engine.js'], body.replace('None:', 'Changed:')).some(e => e.includes('meaningful update')), 'Declared logic changes outside known paths also require rules');
assert(run([], '').length >= 2, 'Missing declarations fail');
assert(run([], body.replace('#round', '#missing')).some(e => e.includes('unknown')));
assert(run([], body.replace('None: presentation changes preserve all actions and saved-state meaning.', 'None:')).length);
const unrelated = '## Rules grounding\nNot applicable: account styling only; see docs/nido-auth.md for the authentication contract.\n## Gameplay impact\nNone: no Galactic Reach game behavior or state changes.';
assert.deepEqual(run(['crates/server/src/accounts.rs'], unrelated), []);
assert(run(['prototypes/galactic-reach/app.js', RULEBOOK], unrelated).some(e => e.includes('not applicable')));
assert(run([], '<!--' + body + '-->').length, 'Unfilled template comments do not count');
console.log('Rules contract tests passed: paired edits, unrelated work, invalid anchors, missing declarations, and renamed engine paths.');
