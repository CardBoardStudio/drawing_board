// A PR must explain its rules grounding; engine edits must travel with the manual.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const RULEBOOK = 'prototypes/galactic-reach/rulebook.html';
const ruleBearing = path => /^(prototypes\/galactic-reach\/(app|adapter)\.js|crates\/galactic-reach\/.*\.(rs|js)|crates\/game-core\/src\/.*\.rs|crates\/server\/src\/(tables|arena)\.rs)$/.test(path);
function section(body, heading) {
  return body.replace(/<!--[\s\S]*?-->/g, '').match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'))?.[1].trim() || '';
}
function validate({ files, body, rulebook }) {
  const errors = [];
  const grounding = section(body, 'Rules grounding');
  const impact = section(body, 'Gameplay impact');
  const anchors = new Set([...rulebook.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const references = [...grounding.matchAll(/rulebook\.html#([a-z0-9-]+)/g)].map(m => m[1]);
  const engineChanged = files.some(ruleBearing);
  const excluded = /^Not applicable:\s*\S[\s\S]{20,}/i.test(grounding);
  if (!references.length && !excluded) errors.push('Rules grounding must cite rulebook.html#section and explain the connection, or say "Not applicable: <reason and relevant specification>".');
  if (references.some(id => !anchors.has(id))) errors.push('Rules grounding references an unknown rulebook section.');
  if (engineChanged && excluded) errors.push('Rule-bearing files changed: Galactic Reach rules cannot be marked not applicable.');
  if (!/^(None|Changed):\s*\S[\s\S]{20,}/i.test(impact)) errors.push('Gameplay impact must start with "None:" or "Changed:" and explain the behavior or why it is preserved.');
  if ((engineChanged || /^Changed:/i.test(impact)) && !files.includes(RULEBOOK)) errors.push(`Game logic changes require a meaningful update to ${RULEBOOK} in the same PR.`);
  return errors;
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
    const base = args[0] || event.pull_request?.base?.sha;
    if (!base) throw new Error('Provide a base ref or a pull_request event.');
    const bodyIndex = args.indexOf('--body-file');
    const body = bodyIndex >= 0 ? fs.readFileSync(args[bodyIndex + 1], 'utf8') : event.pull_request?.body || '';
    // NUL separators preserve unusual filenames; include both paths for renames.
    const files = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', base, '--'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const errors = validate({ files, body, rulebook: fs.readFileSync(RULEBOOK, 'utf8') });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Rules contract passed: grounding declared; rule-bearing edits paired with the rulebook.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validate, ruleBearing, RULEBOOK };
