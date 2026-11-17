// Card generator for the card-evolution study. It composes market and relic cards only
// from fields the engine already resolves (rules #cards, #buy, #combat), so a generated
// card needs no new code: move range/pathfinder/assault, construct buildDiscount/
// secondBuild/buildGain, colonize colonyCost/keepSettler/colonyPrestige, special effect
// {draw, trashStarters, limits, trashSelf, produce, gain, prestige}, buyEffect,
// gainPrestige, military attack/shield/pierce/victoryPrestige/loot, relic reactions.
//
// Price comes from a power model fitted to the printed 37.42 market (see POWER below and
// README.md), with a small random markup so evolution can also test price points.

const RESOURCES = ['matter', 'energy', 'biomass', 'data'];
const RESOURCE_NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Biomass', data: 'Data' };
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

// Market tiers by total printed price, matching the tiered-market rules (#market-tiers).
// On rules without tiers they are still used as quotas so the price spread stays put.
const TIERS = { cheap: [3, 5], medium: [6, 7], expensive: [8, 15] };
const RELIC_POWER = [6, 11];

function tierOf(price) { return price >= 8 ? 'expensive' : price >= 6 ? 'medium' : 'cheap'; }
const priceOf = cost => Object.values(cost || {}).reduce((a, b) => a + b, 0);

// ---------- random helpers ----------
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = (rng, p) => rng() < p;
function weighted(rng, entries) {
  const total = entries.reduce((n, [, w]) => n + w, 0);
  let r = rng() * total;
  for (const [value, w] of entries) { if ((r -= w) < 0) return value; }
  return entries[entries.length - 1][0];
}

// ---------- power model (price units ~ total resources) ----------
// Fitted by hand to the printed market: Ion Thrusters (+2 move) 5, Fold-Space Gate (+5) 8,
// Strike Vector 6, Prefab Yards 5, World Engine 10, Seed Ark 5, Colony Pods 6,
// Genesis Charter 10, Signal Relay (draw 2) 3, Strategy Core 6, Command Nexus 8,
// Archive Purge 6, Cargo Expansion 6, Hyperspace Vaults 9, Monument 10, Dyson Lattice 14,
// Ascendancy Codex 14, Rail Battery 5, Deflector Grid 5, Nova Barrage 10, Aegis Lattice 9.
// Refitted after the 2026-11-16 rebalance (changes/gr-rebalance-b2.md), which made
// per-play Prestige, reusable limit raises and Wonder Prestige dearer.
const DRAW_VALUE = [0, 1.5, 3, 6, 8, 10];
function effectPower(effect = {}) {
  let v = DRAW_VALUE[effect.draw || 0] || 0;
  v += (effect.trashStarters || 0) * 2;
  const limitPoints = RESOURCES.reduce((n, r) => n + ((effect.limits || {})[r] || 0), 0);
  // A reusable limit raise repeats every play (Hyperspace Vaults: +1 each for 9); a one-shot
  // raise is close to a Capacity Module (Cargo Expansion: +2 each, then trashed, for 6).
  v += limitPoints * (effect.trashSelf ? 0.75 : 1.9);
  v += effect.produce ? 5 : 0;
  v += RESOURCES.reduce((n, r) => n + ((effect.gain || {})[r] || 0), 0) * 0.9;
  // Prestige on every play (Ascendancy Codex: 1 for 14).
  v += (effect.prestige || 0) * 14;
  if (effect.trashSelf && !limitPoints) v *= 0.6;
  return v;
}
function power(card) {
  if (card.military) {
    const loot = RESOURCES.reduce((n, r) => n + ((card.loot || {})[r] || 0), 0);
    // Shields are worth less per point as they grow (Deflector Grid 3 -> 5, Aegis Lattice 8 -> 9).
    return 1 + 1.8 * (card.attack || 0) + 2.3 * Math.sqrt(card.shield || 0) + (card.pierce ? 3.4 : 0) + (card.victoryPrestige || 0) * 2.2 + loot * 0.8;
  }
  // Wonders: Monument of Accord 3 for 10, Dyson Lattice 4 for 14.
  if (card.gainPrestige) return -2 + 4 * card.gainPrestige;
  if (card.buyEffect) return 6;
  if (card.reaction) return card.reaction === 'prevent' ? 1 + card.strength * 1.5 : 1 + card.strength * 2 - (card.requiresFleet ? 1 : 0);
  switch (card.order) {
    // Range beyond 3 is worth less per point (Fold-Space Gate: +5 for 8).
    case 'move': { const range = card.range || 0; return 2 + 1.5 * Math.min(range, 3) + Math.max(0, range - 3) - (card.pathfinder ? 1.5 : 0) + 1.25 * (card.assault || 0); }
    case 'construct': {
      const gain = RESOURCES.reduce((n, r) => n + ((card.buildGain || {})[r] || 0), 0);
      return 2 + ({ each: 2, free: 9 }[card.buildDiscount] || 0) + (card.secondBuild ? 1 : 0) + gain * 1.2;
    }
    case 'colonize': return 2 + ({ 0: 4, 1: 3, 2: 0 }[card.colonyCost ?? 2]) + (card.keepSettler ? 1 : 0) + (card.colonyPrestige || 0) * 2;
    case 'special': return effectPower(card.effect);
    default: return 0;
  }
}

// ---------- printed text, in the catalog's voice ----------
const plural = (n, word) => `${NUMBER_WORDS[n] || n} ${word}${n === 1 ? '' : 's'}`;
const listResources = obj => RESOURCES.filter(r => obj[r]).map(r => `${obj[r]} ${RESOURCE_NAMES[r]}`).join(' and ');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function limitsText(limits) {
  const rs = RESOURCES.filter(r => limits[r]);
  if (rs.length === 4 && rs.every(r => limits[r] === limits[rs[0]])) return `raise each resource limit by ${limits[rs[0]]}`;
  return `raise your ${rs.map(r => `${RESOURCE_NAMES[r]} limit by ${limits[r]}`).join(' and ')}`;
}
function effectText(effect) {
  // Resolution order matches resolveCardEffect: limits, trash, production, gains, Prestige, draws.
  const parts = [];
  if (effect.limits) parts.push(`permanently ${limitsText(effect.limits)}`);
  if (effect.trashStarters) parts.push(`choose up to ${NUMBER_WORDS[effect.trashStarters]} level I starter card${effect.trashStarters > 1 ? 's' : ''} in your discard pile and trash ${effect.trashStarters > 1 ? 'them' : 'it'} permanently`);
  if (effect.produce) parts.push('collect your round production again');
  if (effect.gain) parts.push(`gain ${listResources(effect.gain)}`);
  if (effect.prestige) parts.push(`gain ${effect.prestige} permanent Prestige`);
  if (effect.draw) parts.push(`draw ${plural(effect.draw, 'card')}`);
  let text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')}, then ${parts[parts.length - 1]}` : parts[0];
  if (effect.trashSelf) text += ', then trash this card';
  return cap(text) + '.';
}
function cardText(card) {
  if (card.military) {
    const bits = [];
    if (card.attack) bits.push(`+${card.attack} hit${card.attack > 1 ? 's' : ''}`);
    if (card.shield) bits.push(`prevent ${card.shield} hit${card.shield > 1 ? 's' : ''}`);
    let text = cap(bits.join(' and ')) + ' this volley.';
    if (card.pierce) text += ' The opponent’s shields prevent none of your hits.';
    if (card.loot) text += ` After the battle, gain ${listResources(card.loot)}.`;
    if (card.victoryPrestige) text += ` If your side wins a decisive combat victory, gain ${card.victoryPrestige} more permanent Prestige.`;
    return text;
  }
  if (card.gainPrestige) return `When bought, gain ${card.gainPrestige} permanent Prestige. This card enters discard and has no effect in hand; trash it later to remove it from your deck.`;
  if (card.buyEffect) return 'Buy turn: your next purchase this Buy costs 1 less of each resource in its cost.';
  if (card.reaction === 'prevent') return `Automatic reaction: prevent up to ${card.strength} incoming hits in your next combat volley.`;
  if (card.reaction === 'targeting') return `Automatic reaction: ${card.requiresFleet ? 'with a surviving Fleet, ' : ''}add ${card.strength} hits to your next combat volley.`;
  switch (card.order) {
    case 'move': {
      let text = `Move one group with +${card.range} range.`;
      if (card.pathfinder) text += ' It cannot enter hostile hexes.';
      if (card.assault) text += ` If it attacks, add ${card.assault} hit${card.assault > 1 ? 's' : ''} to the first volley.`;
      return text;
    }
    case 'construct': {
      let text = card.buildDiscount === 'free' ? 'Build or commission once at no resource cost'
        : card.buildDiscount === 'each' ? 'Build or commission once, paying 1 less of each resource in its cost' : 'Build or commission once';
      if (card.secondBuild) text += '; then you may build once more at full price';
      text += '.';
      if (card.buildGain) text += ` After a build with this card, gain ${listResources(card.buildGain)}.`;
      return text;
    }
    case 'colonize': {
      let text = `Colonize with a Settler for ${card.colonyCost} Biomass`;
      text += card.keepSettler ? ' without consuming the Settler' : '. The Settler is consumed';
      if (card.colonyPrestige) text += `, and gain ${card.colonyPrestige} permanent Prestige`;
      return text + '.';
    }
    case 'special': return effectText(card.effect);
    default: return '';
  }
}

// ---------- names ----------
const NAME_WORDS = {
  Movement: [['Ion', 'Vector', 'Comet', 'Drift', 'Slip', 'Warp', 'Pulse', 'Solar', 'Tachyon', 'Nebula', 'Arc', 'Helix'], ['Thrusters', 'Lanes', 'Sails', 'Drive', 'Wake', 'Corridor', 'Jets', 'Charts', 'Runner', 'Gate']],
  Industry: [['Prefab', 'Foundry', 'Forge', 'Orbital', 'Modular', 'Titan', 'Anvil', 'Lattice', 'Keel', 'Rivet'], ['Yards', 'Works', 'Cradle', 'Assembly', 'Engine', 'Docks', 'Mills', 'Frames', 'Crews', 'Press']],
  Expansion: [['Seed', 'Verdant', 'Genesis', 'Bloom', 'Harbor', 'Root', 'Frontier', 'Spore', 'Pioneer', 'Tidal'], ['Ark', 'Pods', 'Charter', 'Colonists', 'Landing', 'Covenant', 'Nursery', 'Grant', 'Haven', 'Mandate']],
  Deckcraft: [['Strategy', 'Signal', 'Command', 'Survey', 'Archive', 'Cipher', 'Oracle', 'Quorum', 'Relay', 'Insight'], ['Core', 'Network', 'Nexus', 'Briefing', 'Purge', 'Loop', 'Index', 'Council', 'Ledger', 'Uplink']],
  Capacity: [['Cargo', 'Hyperspace', 'Bulk', 'Deep', 'Hold', 'Silo', 'Pocket', 'Stack', 'Vault', 'Reserve'], ['Expansion', 'Vaults', 'Holds', 'Racks', 'Bays', 'Depot', 'Annex', 'Chambers', 'Stores', 'Tanks']],
  Economy: [['Harvest', 'Yield', 'Market', 'Tithe', 'Refinery', 'Surplus', 'Bounty', 'Mining', 'Ration', 'Trade'], ['Contract', 'Season', 'Levy', 'Boom', 'Windfall', 'Quota', 'Dividend', 'Run', 'Cycle', 'Fair']],
  Buy: [['Trade', 'Procurement', 'Barter', 'Broker', 'Exchange', 'Merchant', 'Bazaar', 'Credit', 'Bulk', 'Tariff'], ['Syndicate', 'Hub', 'Guild', 'Office', 'House', 'Bureau', 'Pact', 'Desk', 'League', 'Ring']],
  Wonder: [['Monument', 'Spire', 'Beacon', 'Colossus', 'Halo', 'Dyson', 'Sky', 'Eternal', 'Crystal', 'Star'], ['of Accord', 'of Dawn', 'Lattice', 'Array', 'Throne', 'Crown', 'Garden', 'Archive', 'Choir', 'Vault']],
  Prestige: [['Ascendancy', 'Triumph', 'Laurel', 'Sovereign', 'Glory', 'Legacy', 'Herald', 'Renown', 'Paragon', 'Mythic'], ['Codex', 'Hymn', 'Charter', 'Decree', 'Saga', 'Banner', 'Edict', 'Canon', 'Rite', 'Oath']],
  Military: [['Rail', 'Torpedo', 'Flak', 'Phase', 'Nova', 'Aegis', 'Hardlight', 'Plasma', 'Void', 'Ion', 'Storm', 'Siege'], ['Battery', 'Spread', 'Screen', 'Lance', 'Barrage', 'Lattice', 'Bulwark', 'Volley', 'Ward', 'Ram', 'Salvo', 'Doctrine']],
  Relic: [['Shard', 'Echo', 'Lantern', 'Spiral', 'Crown', 'Mirror', 'Seed', 'Loom', 'Bell', 'Prism', 'Orrery', 'Tablet'], ['of the Deep Choir', 'of Hollow Suns', 'of the First Fleet', 'of Silent Tides', 'of the Lost Architects', 'of Ember Skies', 'of the Nameless', 'of Glass Moons', 'of the Long Night', 'of Distant Shores']],
};
function makeName(rng, role, used) {
  const [a, b] = NAME_WORDS[role] || NAME_WORDS.Relic;
  for (let n = 0; n < 200; n++) {
    const name = `${pick(rng, a)} ${pick(rng, b)}`;
    if (!used.has(name)) { used.add(name); return name; }
  }
  for (let n = 2; ; n++) { const name = `${pick(rng, a)} ${pick(rng, b)} ${n}`; if (!used.has(name)) { used.add(name); return name; } }
}

// ---------- samplers: one per role; each returns rule fields only ----------
const ACCENT = { matter: 'var(--matter)', energy: 'var(--energy)', biomass: 'var(--biomass)', data: 'var(--data)', gold: 'var(--gold)', red: 'var(--red)' };
const eachLimit = v => Object.fromEntries(RESOURCES.map(r => [r, v]));
const someLimits = rng => chance(rng, 0.5) ? eachLimit(int(rng, 1, 2)) : { [pick(rng, RESOURCES)]: int(rng, 2, 4) };
const someGain = rng => { const a = pick(rng, RESOURCES), b = pick(rng, RESOURCES); const g = { [a]: int(rng, 1, 3) }; if (b !== a && chance(rng, 0.5)) g[b] = int(rng, 1, 2); return g; };

const MARKET_ROLES = {
  Movement: { primary: ['energy', 'energy', 'data'], sample: rng => ({ order: 'move', range: int(rng, 1, 5), ...(chance(rng, 0.25) ? { pathfinder: true } : {}), ...(chance(rng, 0.3) ? { assault: int(rng, 1, 3) } : {}) }) },
  Industry: { primary: ['matter'], sample: rng => {
    const discount = weighted(rng, [[null, 2], ['each', 3], ['free', 1.5]]);
    const f = { order: 'construct' };
    if (discount) f.buildDiscount = discount;
    if (chance(rng, discount === 'free' ? 0.15 : 0.55)) f.secondBuild = true;
    if (chance(rng, 0.35) || (!discount && !f.secondBuild)) f.buildGain = someGain(rng);
    return f;
  } },
  Expansion: { primary: ['biomass'], sample: rng => {
    const f = { order: 'colonize', colonyCost: weighted(rng, [[1, 3], [0, 2], [2, 1]]) };
    if (chance(rng, 0.55)) f.keepSettler = true;
    if (chance(rng, 0.3)) f.colonyPrestige = int(rng, 1, 2);
    if (f.colonyCost === 2 && !f.keepSettler && !f.colonyPrestige) f.keepSettler = true;
    return f;
  } },
  Deckcraft: { primary: ['data'], sample: rng => {
    const effect = { draw: weighted(rng, [[1, 1], [2, 3], [3, 3], [4, 1.5]]) };
    if (chance(rng, 0.3)) effect.trashStarters = int(rng, 1, 2);
    return { order: 'special', effect };
  } },
  Capacity: { primary: ['matter', 'data'], sample: rng => {
    const effect = { limits: someLimits(rng) };
    if (chance(rng, 0.45)) effect.draw = int(rng, 1, 2);
    if (chance(rng, 0.4)) effect.trashSelf = true;
    return { order: 'special', effect };
  } },
  Economy: { primary: ['biomass', 'matter', 'energy'], sample: rng => {
    const effect = chance(rng, 0.35) ? { produce: true } : { gain: someGain(rng) };
    if (chance(rng, 0.5)) effect.draw = int(rng, 1, 2);
    return { order: 'special', effect };
  } },
  Buy: { primary: ['energy', 'data'], sample: rng => ({ buyEffect: chance(rng, 0.5) ? 'discountEach' : 'hubDiscount' }) },
  Wonder: { primary: ['matter', 'energy'], sample: rng => ({ gainPrestige: int(rng, 2, 5) }) },
  Prestige: { primary: ['data', 'biomass'], sample: rng => ({ order: 'special', effect: { prestige: int(rng, 1, 2), ...(chance(rng, 0.6) ? { draw: int(rng, 1, 2) } : {}) } }) },
  Military: { primary: ['matter', 'energy'], sample: rng => {
    const shape = weighted(rng, [['attack', 3], ['shield', 2.5], ['mixed', 2], ['special', 1.5]]);
    const f = { military: true, attack: 0, shield: 0 };
    if (shape === 'attack') f.attack = int(rng, 1, 5);
    else if (shape === 'shield') f.shield = int(rng, 2, 8);
    else if (shape === 'mixed') { f.attack = int(rng, 1, 3); f.shield = int(rng, 1, 4); }
    else { f.attack = int(rng, 1, 3); const extra = pick(rng, ['pierce', 'victoryPrestige', 'loot']); if (extra === 'pierce') f.pierce = true; else if (extra === 'victoryPrestige') f.victoryPrestige = int(rng, 1, 2); else f.loot = someGain(rng); }
    return f;
  } },
};
const RELIC_SHAPES = {
  Exploration: [
    [rng => ({ order: 'move', range: int(rng, 2, 5), ...(chance(rng, 0.4) ? { pathfinder: true } : {}) }), 2],
    [rng => ({ order: 'special', effect: { draw: int(rng, 2, 4), ...(chance(rng, 0.4) ? { trashStarters: int(rng, 1, 2) } : {}) } }), 2],
    [rng => ({ order: 'special', effect: { limits: { data: int(rng, 1, 3) }, draw: int(rng, 1, 3) } }), 1],
  ],
  Military: [
    [rng => ({ order: 'move', range: int(rng, 1, 3), assault: int(rng, 2, 4) }), 2],
    [rng => ({ reaction: 'prevent', strength: int(rng, 3, 6) }), 1],
    [rng => ({ reaction: 'targeting', strength: int(rng, 2, 5), ...(chance(rng, 0.6) ? { requiresFleet: true } : {}) }), 1],
  ],
  Settlement: [
    [rng => { const d = weighted(rng, [['free', 2], ['each', 2]]); return { order: 'construct', buildDiscount: d, ...(d === 'each' ? { secondBuild: true } : {}), ...(chance(rng, 0.4) ? { buildGain: someGain(rng) } : {}) }; }, 2],
    [rng => ({ order: 'colonize', colonyCost: weighted(rng, [[0, 2], [1, 2]]), keepSettler: true, ...(chance(rng, 0.4) ? { colonyPrestige: int(rng, 1, 2) } : {}) }), 2],
    [rng => ({ order: 'special', effect: chance(rng, 0.5) ? { limits: someLimits(rng), draw: int(rng, 1, 2) } : { gain: someGain(rng), draw: int(rng, 1, 2) } }), 1],
  ],
};

// Spread a total price over a primary resource and up to two others, keeping the printed
// market's shape: a card above the starting limits needs 5+ of one resource; a card that
// fits the starting limits (total <= 4) splits its price across resources of at most 3.
function composeCost(rng, price, primary) {
  const cost = {};
  if (price <= 4) {
    cost[primary] = Math.min(3, Math.max(1, price - 1));
    let rest = price - cost[primary];
    const others = RESOURCES.filter(r => r !== primary);
    while (rest > 0) { const r = pick(rng, others); const add = Math.min(rest, 3 - (cost[r] || 0)); if (add > 0) { cost[r] = (cost[r] || 0) + add; rest -= add; } }
    return cost;
  }
  cost[primary] = Math.max(5, Math.min(price, Math.round(price * (0.55 + rng() * 0.3))));
  let rest = price - cost[primary];
  const others = RESOURCES.filter(r => r !== primary).sort(() => rng() - 0.5).slice(0, rest > 3 ? 2 : 1);
  others.forEach((r, i) => { const add = i === others.length - 1 ? rest : Math.max(1, Math.round(rest * (0.4 + rng() * 0.3))); if (add > 0) { cost[r] = add; rest -= add; } });
  return Object.fromEntries(RESOURCES.filter(r => cost[r]).map(r => [r, cost[r]]));
}

function finishMarketCard(rng, fields, role, primary, band, markup) {
  const raw = power(fields);
  const price = Math.round(raw * markup);
  if (price < band[0] || price > band[1]) return null;
  const cost = composeCost(rng, price, primary);
  if (priceOf(cost) !== price) return null;
  return { ...fields, kind: role, cost, power: Math.round(raw * 10) / 10 };
}

// Generate one market card for a role and tier. ctx = { rng, gen, index, usedNames, markup }
function generateMarketCard(ctx, role, tier) {
  const spec = MARKET_ROLES[role];
  const band = TIERS[tier];
  for (let attempt = 0; attempt < 400; attempt++) {
    const markup = 1 + (ctx.rng() * 2 - 1) * (ctx.markup ?? 0.15);
    const fields = spec.sample(ctx.rng);
    const card = finishMarketCard(ctx.rng, fields, role, pick(ctx.rng, spec.primary), band, markup);
    if (card) return label(ctx, card, role, 'market');
  }
  return null; // this role cannot reach this tier (e.g. a cheap Wonder)
}

function generateRelic(ctx, affinity) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const fields = weighted(ctx.rng, RELIC_SHAPES[affinity])(ctx.rng);
    const p = power(fields);
    if (p < RELIC_POWER[0] || p > RELIC_POWER[1]) continue;
    return label(ctx, { ...fields, kind: 'Alien Relic', affinity, power: Math.round(p * 10) / 10 }, 'Relic', 'relic');
  }
  return null;
}

function label(ctx, card, role, pool) {
  const n = String(ctx.index()).padStart(2, '0');
  const key = `evo${ctx.runTag || ''}G${ctx.gen}${pool === 'relic' ? 'R' : 'M'}${n}`;
  const name = makeName(ctx.rng, role, ctx.usedNames);
  const accent = card.military ? ACCENT.red : pool === 'relic' ? ACCENT.gold : card.cost ? ACCENT[Object.entries(card.cost).sort((a, b) => b[1] - a[1])[0][0]] : ACCENT.gold;
  const out = { code: `${pool === 'relic' ? 'R' : 'E'}${ctx.gen}-${n}`, name, ...card, accent, text: cardText(card), origin: { generation: ctx.gen, source: ctx.parent ? 'mutation' : 'generated', ...(ctx.parent ? { parent: ctx.parent } : {}) } };
  if (!card.military) out.tag = key; // the engine looks up move/construct/colonize fields by tag
  if (card.military) out.kind = 'Military';
  if (pool === 'relic') out.lore = 'A generated relic from the card-evolution study.';
  return { key, card: out, role, pool };
}

// Mutate one rule field of a surviving card (a "variant"), then re-price and re-text it.
function mutate(ctx, entry) {
  const base = JSON.parse(JSON.stringify(entry.card));
  delete base.tag; delete base.code; delete base.text; delete base.origin; delete base.power; delete base.name; delete base.accent; delete base.lore;
  const rng = ctx.rng, nudge = (v, lo, hi) => Math.max(lo, Math.min(hi, (v || 0) + (chance(rng, 0.5) ? 1 : -1)));
  for (let attempt = 0; attempt < 60; attempt++) {
    const f = JSON.parse(JSON.stringify(base));
    if (f.military) { const k = pick(rng, ['attack', 'shield', 'attack', 'shield', 'victoryPrestige']); f[k] = nudge(f[k], 0, k === 'shield' ? 8 : 5); if (!f.attack && !f.shield) continue; if (!f.victoryPrestige) delete f.victoryPrestige; }
    else if (f.gainPrestige) f.gainPrestige = nudge(f.gainPrestige, 2, 5);
    else if (f.reaction) f.strength = nudge(f.strength, 2, 6);
    else if (f.order === 'move') { const k = pick(rng, ['range', 'range', 'assault', 'pathfinder']); if (k === 'pathfinder') f.pathfinder = !f.pathfinder; else f[k] = nudge(f[k], k === 'range' ? 1 : 0, 5); if (!f.assault) delete f.assault; if (!f.pathfinder) delete f.pathfinder; }
    else if (f.order === 'construct') { const k = pick(rng, ['secondBuild', 'buildGain', 'buildDiscount']); if (k === 'secondBuild') { if (f.secondBuild) delete f.secondBuild; else f.secondBuild = true; } else if (k === 'buildGain') { if (f.buildGain) delete f.buildGain; else f.buildGain = someGain(rng); } else f.buildDiscount = pick(rng, ['each', 'free', undefined]); if (!f.buildDiscount) delete f.buildDiscount; if (!f.buildDiscount && !f.secondBuild && !f.buildGain) continue; }
    else if (f.order === 'colonize') { const k = pick(rng, ['colonyCost', 'keepSettler', 'colonyPrestige']); if (k === 'colonyCost') f.colonyCost = nudge(f.colonyCost, 0, 2); else if (k === 'keepSettler') { if (f.keepSettler) delete f.keepSettler; else f.keepSettler = true; } else { f.colonyPrestige = nudge(f.colonyPrestige, 0, 2); if (!f.colonyPrestige) delete f.colonyPrestige; } }
    else if (f.order === 'special') { const e = f.effect; const k = pick(rng, Object.keys(e).filter(x => ['draw', 'trashStarters', 'prestige'].includes(x)).concat(['draw'])); e[k] = nudge(e[k], k === 'prestige' ? 1 : 0, k === 'draw' ? 4 : 2); if (!e[k]) delete e[k]; if (!Object.keys(e).filter(x => x !== 'trashSelf').length) continue; }
    else if (f.buyEffect) return null;
    delete f.kind; delete f.cost; delete f.affinity;
    const child = { ...ctx, parent: entry.key };
    if (entry.pool === 'relic') {
      const p = power(f);
      if (p < RELIC_POWER[0] || p > RELIC_POWER[1]) continue;
      return label(child, { ...f, kind: 'Alien Relic', affinity: entry.card.affinity, power: Math.round(p * 10) / 10 }, 'Relic', 'relic');
    }
    const primary = Object.entries(entry.card.cost).sort((a, b) => b[1] - a[1])[0][0];
    const role = entry.role;
    const card = finishMarketCard(rng, f, role, primary, [3, 15], 1 + (rng() * 2 - 1) * (ctx.markup ?? 0.15));
    if (card) return label(child, card, role, 'market');
  }
  return null;
}

// Role of a printed (current) card, for diversity accounting of the baseline pool.
function roleOfPrinted(card) {
  if (card.military) return 'Military';
  if (card.kind === 'Alien Relic') return 'Relic';
  return card.kind;
}

module.exports = { RESOURCES, TIERS, RELIC_POWER, MARKET_ROLES, RELIC_SHAPES, tierOf, priceOf, power, cardText, composeCost, generateMarketCard, generateRelic, mutate, roleOfPrinted };
