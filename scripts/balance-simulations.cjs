const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.resolve(__dirname, '../prototypes/galactic-reach/app.js');
const original = fs.readFileSync(sourcePath, 'utf8');
const strategies = ['military', 'economy', 'expansion'];

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function replaceOrFail(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Simulator patch not found: ${label}`);
  return source.replace(search, replacement);
}

function makeGame(seed, seatStrategies, fleetProduction) {
  let source = original;
  source = replaceOrFail(
    source,
    "if (state.phase !== 'operations' || state.activePlayer === 0 || state.winner !== null) return;",
    "if (state.phase !== 'operations' || state.winner !== null) return;",
    'AI operation guard'
  );
  source = replaceOrFail(
    source,
    "if (chooser !== 0) {",
    "if (true) {",
    'automatic directive chooser'
  );
  source = replaceOrFail(
    source,
    "if ($('#directive-dialog').open) $('#directive-dialog').close();",
    "",
    'directive dialog'
  );
  source = replaceOrFail(
    source,
    "state.players[playerId].resources[planet.type] += 1;",
    "state.players[playerId].resources[planet.type] += 1; state.sim.fleetIncome[playerId] += 1;",
    'fleet-income instrumentation'
  );
  if (!fleetProduction) {
    source = replaceOrFail(
      source,
      `    Object.entries(state.planets).forEach(([coord,planet]) => {
      fleetControllersAt(coord).forEach(playerId => {
        state.players[playerId].resources[planet.type] += 1; state.sim.fleetIncome[playerId] += 1;
      });
    });`,
      '',
      'fleet production toggle'
    );
  }
  source = replaceOrFail(
    source,
    "  function resolveCombat(attackerId, coord, origin, options = {}) {\n    const defenderId",
    "  function resolveCombat(attackerId, coord, origin, options = {}) {\n    state.sim.combats += 1;\n    const defenderId",
    'combat instrumentation'
  );
  source = replaceOrFail(
    source,
    "    if (capture) {\n      planet.owner = playerId;",
    "    if (capture) {\n      state.sim.conquests[playerId] += 1;\n      planet.owner = playerId;",
    'conquest instrumentation'
  );
  source = source.replace(
    /  function startPolicyVote\(\) \{[\s\S]*?\n  \}\n\n  function resolvePolicyVote/,
    `  function startPolicyVote() {
    state.phase = 'policy';
    const choices = POLICY_PAIRS[state.policyCycle % POLICY_PAIRS.length];
    state.pendingPolicyChoices = choices.map(policy => ({ ...policy }));
    const player = state.players[0];
    const preferredTrack = player.strategy === 'military' ? 'technology' : player.strategy === 'economy' ? 'economy' : 'expansion';
    let choice = choices.findIndex(policy => policy.track === preferredTrack);
    if (choice < 0) choice = player.id % 2;
    const bid = Math.min(player.tracks[choices[choice].track], 1 + Math.floor(state.round / 6));
    resolvePolicyVote(choice, bid);
  }

  function resolvePolicyVote`
  );
  source = source.replace(
    /  function render\(\) \{[\s\S]*?\n  \}\n\n  function switchTab/,
    '  function render() {}\n\n  function switchTab'
  );
  source = source.replace(
    /  function showMessage\(kicker,title,body\) \{[\s\S]*?\n  \}\n\n  function toast/,
    '  function showMessage() {}\n\n  function toast'
  );
  source = source.replace(
    /  function toast\(message, cost = null, suffix = ''\) \{[\s\S]*?\n  \}\n\n  function boardIcon/,
    '  function toast() {}\n\n  function boardIcon'
  );

  const bootstrap = `
  state = newState();
  state.players.forEach((player, index) => { player.strategy = ${JSON.stringify(seatStrategies)}[index]; });
  state.sim = { fleetIncome: [0,0,0,0], combats: 0, conquests: [0,0,0,0] };
  fillMarket();
  beginRound();
  globalThis.__gr = {
    getState: () => state,
    step: () => {
      if (state.winner !== null) return;
      if (state.phase === 'operations') runAiOperation();
      else if (state.phase === 'buy') runAiBuy();
    },
    prestige: id => calculatePrestige(id),
    colonies: id => colonyPlanets(id).length,
    controlled: id => controlledPlanets(id).length,
    fleetPower: id => strongestFleet(id),
    stations: id => researchStationCount(id)
  };
})();`;
  source = source.replace(/\n  wireUi\(\);[\s\S]*?\n\}\)\(\);\s*$/, `\n${bootstrap}`);

  const math = Object.create(Math);
  math.random = seededRandom(seed);
  const context = {
    Math: math,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: sourcePath });
  return context.__gr;
}

function seatAssignments() {
  const assignments = [];
  strategies.forEach(duplicate => {
    const base = [duplicate, ...strategies];
    for (let rotation = 0; rotation < 4; rotation += 1) {
      assignments.push(base.map((_, index) => base[(index + rotation) % 4]));
    }
  });
  return assignments;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(value, total) {
  return total ? Math.round(value * 1000 / total) / 10 : 0;
}

function runBatch(label, fleetProduction, gamesPerAssignment = 40) {
  const games = [];
  const assignments = seatAssignments();
  assignments.forEach((assignment, assignmentIndex) => {
    for (let repetition = 0; repetition < gamesPerAssignment; repetition += 1) {
      const seed = 20261011 + assignmentIndex * 100003 + repetition * 7919;
      const game = makeGame(seed, assignment, fleetProduction);
      let steps = 0;
      while (game.getState().winner === null && game.getState().round <= 24 && steps < 20000) {
        game.step();
        steps += 1;
      }
      const state = game.getState();
      games.push({
        winner: state.winner,
        completed: state.winner !== null,
        rounds: state.winner === null ? 24 : state.round,
        players: state.players.map((player, seat) => ({
          seat,
          strategy: player.strategy,
          prestige: game.prestige(seat),
          colonies: game.colonies(seat),
          controlled: game.controlled(seat),
          fleetPower: game.fleetPower(seat),
          stations: game.stations(seat),
          relics: player.relics,
          starbases: Object.values(state.planets).filter(planet => planet.owner === seat && planet.upgrade === 'starbase').length,
          awards: Object.values(state.awards).filter(owner => owner === seat).length,
          influence: Object.values(player.tracks).reduce((sum, value) => sum + value, 0),
          cardsPurchased: player.cardsPurchased || 0,
          fleetIncome: state.sim.fleetIncome[seat],
          conquests: state.sim.conquests[seat]
        })),
        combats: state.sim.combats
      });
    }
  });

  const playerRows = games.flatMap(game => game.players.map(player => ({
    ...player,
    won: game.winner === player.seat
  })));
  const completed = games.filter(game => game.completed);
  const summarize = (rows) => ({
    playerGames: rows.length,
    wins: rows.filter(row => row.won).length,
    winRate: pct(rows.filter(row => row.won).length, completed.length),
    meanPrestige: Number(mean(rows.map(row => row.prestige)).toFixed(2)),
    meanColonies: Number(mean(rows.map(row => row.colonies)).toFixed(2)),
    meanControlledHexes: Number(mean(rows.map(row => row.controlled)).toFixed(2)),
    meanFleetPower: Number(mean(rows.map(row => row.fleetPower)).toFixed(2)),
    meanStations: Number(mean(rows.map(row => row.stations)).toFixed(2)),
    meanRelics: Number(mean(rows.map(row => row.relics)).toFixed(2)),
    meanStarbases: Number(mean(rows.map(row => row.starbases)).toFixed(2)),
    meanAwards: Number(mean(rows.map(row => row.awards)).toFixed(2)),
    meanInfluence: Number(mean(rows.map(row => row.influence)).toFixed(2)),
    meanCardsPurchased: Number(mean(rows.map(row => row.cardsPurchased)).toFixed(2)),
    meanFleetIncome: Number(mean(rows.map(row => row.fleetIncome)).toFixed(2)),
    meanConquests: Number(mean(rows.map(row => row.conquests)).toFixed(2))
  });

  return {
    label,
    games: games.length,
    completed: completed.length,
    completionRate: pct(completed.length, games.length),
    meanFinishRound: completed.length ? Number(mean(completed.map(game => game.rounds)).toFixed(2)) : null,
    meanCombats: Number(mean(games.map(game => game.combats)).toFixed(2)),
    byStrategy: Object.fromEntries(strategies.map(strategy => [strategy, summarize(playerRows.filter(row => row.strategy === strategy))])),
    bySeat: Object.fromEntries([0,1,2,3].map(seat => [`seat${seat + 1}`, summarize(playerRows.filter(row => row.seat === seat))]))
  };
}

const gamesPerAssignment = Number(process.argv[2] || 40);
console.log(JSON.stringify({
  gamesPerAssignment,
  baseline: runBatch('without fleet production', false, gamesPerAssignment),
  current: runBatch('with fleet production', true, gamesPerAssignment)
}, null, 2));
