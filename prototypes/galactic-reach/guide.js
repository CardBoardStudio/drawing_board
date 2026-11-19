// Galactic Reach guidance: presentation only. On every one of your turns it says what you can
// do right now, beside the piece of the table it is about, and the first time a mechanic
// matters it explains that mechanic once, with a link to its rulebook section. Learn to play
// (tutorial.js) drives the same coach mark through fixed lessons. app.js calls rendered() after
// each render with a read-only port (guidePort); nothing here changes cards, resources or turns.
(() => {
  'use strict';
  const STORE = 'galactic-reach-guide-v1';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const shown = element => Boolean(element?.isConnected && element.getClientRects().length) && getComputedStyle(element).visibility !== 'hidden';
  const RESOURCE_NAMES = { matter: 'Matter', energy: 'Energy', biomass: 'Life', data: 'Data' };
  const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  // Where each resource comes from, in the words of the rulebook's #resources and #trade.
  const SOURCES = {
    matter: 'Matter: convert a Construct card, or own Matter hexes.',
    energy: 'Energy: convert a Move card, or own Energy hexes.',
    biomass: 'Life: own Life hexes, or trade 4 of another resource for 1 at the bank on your mat.',
    data: 'Data: own Data hexes, or trade 4 of another resource for 1 at the bank on your mat.',
  };
  // Ordinary hex distance between two "q,r" keys.
  const hexDistance = (a, b) => { const [q1, r1] = a.split(',').map(Number), [q2, r2] = b.split(',').map(Number); return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2; };
  const costText = cost => Object.entries(cost || {}).filter(([, n]) => n > 0).map(([r, n]) => `${n} ${RESOURCE_NAMES[r]}`).join(', ');
  const colonyLife = (card, capture = false) => port.colonyTerms?.(port.cards[card.key].tag, capture)?.biomass
    ?? port.cards[card.key].colonyCost ?? (capture ? 1 : port.colonyCost ?? 2);

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (saved && typeof saved === 'object') return { enabled: saved.enabled !== false, seen: saved.seen && typeof saved.seen === 'object' ? saved.seen : {} };
    } catch { /* storage blocked: guidance still works for this page */ }
    return { enabled: true, seen: {} };
  }
  const prefs = loadPrefs();
  function savePrefs() { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* not saved */ } }

  const shownAt = {};
  let port = null, frame = 0, coach = null, targeted = [], lastKey = '', lastAnnounced = '', raisedOver = null, currentAnchor = null, currentAvoid = [];

  // ---- Reading the table: what the player can do right now. ----
  function context() {
    const state = port.state, me = port.me, player = state.players[me];
    const myTurn = state.activePlayer === me && state.winner === null;
    const ops = myTurn && state.phase === 'operations', buy = myTurn && state.phase === 'buy';
    const coords = [...new Set([...Object.keys(state.planets), ...Object.keys(state.fleets || {})])];
    const fleetAt = coord => state.fleets?.[coord]?.[me] || null;
    const myUnits = { settler: [], explorer: [], fleet: [] };
    for (const [coord, byPlayer] of Object.entries(state.fleets || {})) {
      const fleet = byPlayer?.[me];
      if (!fleet) continue;
      for (const type of Object.keys(myUnits)) if (fleet[type] > 0) myUnits[type].push(coord);
    }
    const shipyards = Object.entries(state.planets).filter(([, p]) => p.owner === me && p.upgrade === 'starbase').map(([c]) => c);
    const harvesters = Object.entries(state.planets).filter(([, p]) => p.owner === me && p.upgrade === 'harvester').map(([c]) => c);
    const colonies = Object.entries(state.planets).filter(([, p]) => p.owner === me && p.hasColony).map(([c]) => c);
    // Each hand card's legal starting hexes, exactly as drag-to-play and the Sector Scan offer them.
    const playable = [];
    if (ops && ['prep', 'action'].includes(state.turnStage) && !state.pendingConstruct && !state.pendingColonyBuild) {
      for (const card of player.hand) {
        const def = port.cards[card.key];
        if (!def?.order || def.reaction || def.buyEffect) continue;
        if (def.order === 'special') { playable.push({ card, def, targets: [], kind: 'special' }); continue; }
        const targets = coords.filter(coord => port.ordersAt(coord, card.id).length);
        if (targets.length) playable.push({ card, def, targets, kind: port.ordersAt(targets[0], card.id)[0].type });
      }
    }
    const convertible = player.hand.filter(card => port.canConvertCard(card)) ;
    const canConvert = convertible.length > 0 && port.canConvertCards();
    const marketBuys = buy ? state.market.filter(card => port.canAfford(port.purchaseCost(card.key))) : [];
    const upgrades = buy ? [...player.hand, ...player.discard, ...player.inPlay].filter(card => card.starter && port.starterLevel(card) < 3 && port.resources.some(r => player.resources[r] >= port.upgradePrice(card))) : [];
    return { state, me, player, myTurn, ops, buy, playable, convertible, canConvert, marketBuys, upgrades, myUnits, shipyards, harvesters, colonies, fleetAt };
  }

  // ---- Anchors: the real table elements a tip points at. ----
  const handCard = id => $(`#hand-row .game-card[data-card-id="${CSS.escape(id)}"]`);
  const hex = coord => $(`.hex[data-coord="${CSS.escape(coord)}"]`);
  // The turn's main button: on the desktop table it is the board's own Pass & buy / Finish Buy.
  const turnButton = () => firstShown('#board-primary:not([hidden])', '#pass-button:not([hidden])', '#hand-finish-buy-button:not([hidden])', '#finish-buy-button:not([hidden])');
  const firstShown = (...selectors) => selectors.flatMap(s => typeof s === 'string' ? $$(s) : [s]).find(shown) || null;

  // ---- First-time explanations: each shown once, remembered in this browser. ----
  // One short line each, shown at the moment the thing happens and anchored to what it is about.
  const anyHand = c => c.player.hand.find(card => port.cards[card.key].order === 'colonize');
  const EXPLAINERS = [
    { id: 'welcome', when: c => c.ops && c.state.round === 1 && c.state.turnStage === 'prep', title: 'Welcome, commander', rule: 'start',
      text: () => `Race to ${port.victoryTarget()}★. Each turn, play one card's order or pass.`,
      anchor: () => firstShown('[data-score-player="0"]'), show: () => ({ callouts: [{ el: firstShown('[data-score-player="0"]'), label: 'You: 3★ from your Colony', side: 'right' }] }),
      buttons: [{ action: 'learn', label: walkthroughInProgress() ? 'Continue Learn to play' : 'Learn to play', primary: true }] },
    { id: 'hand-lifetime', when: c => c.ops && prefs.seen.welcome, title: 'This round’s hand', rule: 'cleanup-draw',
      text: () => 'Cards you don’t use this round are discarded at its end; resources stay.',
      anchor: () => firstShown('#hand-row'), show: () => ({ callouts: [{ el: firstShown('#hand-row'), label: 'Use or convert these this round' }] }) },
    // Cleanup & draw, the moment a new round's hand has been dealt.
    { id: 'cleanup', when: c => c.ops && c.state.round >= 2, title: 'A new hand', rule: 'cleanup-draw',
      text: () => 'Last round’s cards went to your discard pile; you drew five new ones.',
      anchor: () => firstShown('#discard-button'), show: () => ({ ghost: { from: firstShown('#hand-row'), to: firstShown('#discard-button') }, callouts: [{ el: firstShown('#discard-button'), label: 'Last round’s cards', side: 'left' }, { el: firstShown('#hand-row'), label: 'Five new cards' }] }) },
    // Production, the moment the mat has filled: the hexes that paid flash.
    { id: 'production', when: c => c.ops && c.state.round >= 2 && prefs.seen.cleanup, title: 'Production', rule: 'resources',
      text: () => 'Each hex you own paid out: your mat filled up.',
      anchor: () => firstShown('#resource-grid'), show: c => ({ callouts: [{ el: firstShown('#resource-grid'), label: 'New resources', side: 'left' }, ...producers(c).slice(0, 3).map(coord => ({ el: hex(coord), label: `+${RESOURCE_NAMES[c.state.planets[coord].type]}` }))] }) },
    // Reshuffle, only when the deck has actually run out and the discard was shuffled in.
    { id: 'reshuffle', when: c => c.ops && reshuffled, title: 'Reshuffle', rule: 'round',
      text: () => 'Your deck ran out, so your discard pile was shuffled into a new deck.',
      anchor: () => firstShown('#deck-button'), show: () => ({ ghost: { from: firstShown('#discard-button'), to: firstShown('#deck-button') }, callouts: [{ el: firstShown('#deck-button'), label: 'New deck' }] }) },
    { id: 'buy-turn', when: c => c.buy, title: 'Your Buy turn', rule: 'buy',
      text: () => 'Cards with a gold outline are ones you can afford now.',
      anchor: () => firstShown('[data-buy-market]:not([disabled])', '#market-row'), show: () => ({ callouts: [{ el: firstShown('[data-buy-market]:not([disabled])'), label: 'Gold outline = you can afford it' }] }) },
    { id: 'upgrade-offer', when: c => c.buy && c.upgrades.length > 0, title: 'Upgrades', rule: 'buy',
      text: () => 'Pay 2 of one resource to make a Move or Construct card stronger.',
      anchor: () => firstShown('[data-upgrade-offer]:not([disabled])'), show: () => ({ callouts: [{ el: firstShown('[data-upgrade-offer]:not([disabled])'), label: 'Stronger order' }] }) },
    { id: 'capacity-offer', when: c => c.buy && port.canBuyCapacity(), title: 'Capacity Module', rule: 'capacity-module',
      text: () => 'A Capacity Module card raises your resource limits once you play it.',
      anchor: () => firstShown('[data-capacity-offer]:not([disabled])'), show: () => ({ callouts: [{ el: firstShown('#resource-grid .mat-pips.now i.cap'), label: 'Your limit', side: 'left' }] }) },
    { id: 'shipyard', when: c => c.ops && c.shipyards.length > 0, title: 'Your Shipyard', rule: 'building',
      text: () => 'Use a Construct card’s order here to commission ships.',
      anchor: c => hex(c.shipyards[0]), show: c => ({ callouts: [{ el: hex(c.shipyards[0]), label: 'Your Shipyard' }] }) },
    { id: 'settler', when: c => c.ops && c.myUnits.settler.length > 0, title: 'Your Settler', rule: 'orders',
      text: c => { const g = nearestFreeWorld(c, c.myUnits.settler); return g ? `It founds a Colony on a world’s center: ${g.name} is nearest, ${g.distance} hexes away.` : 'It founds a Colony on the center hex of a world nobody holds.'; },
      anchor: c => hex(c.myUnits.settler[0]), marks: c => { const g = nearestFreeWorld(c, c.myUnits.settler); return g ? [hex(g.center)] : []; },
      show: c => { const g = nearestFreeWorld(c, c.myUnits.settler); return { callouts: [{ el: hex(c.myUnits.settler[0]), label: 'Your Settler' }, ...(g ? [{ el: hex(g.center), label: `${g.name}’s center` }] : [])] }; } },
    { id: 'colonize-card', when: c => c.ops && Boolean(anyHand(c)), title: 'Colonize card', rule: 'orders',
      text: c => `Play it on a Settler standing on a world’s center: ${colonyLife(anyHand(c))} Life, +3★.`,
      anchor: c => handCard(anyHand(c).id) },
    { id: 'probe-card', when: c => c.ops && c.player.hand.some(card => card.key === 'probe'), title: 'Probe / Excavate card', rule: 'movement',
      text: () => 'From your Explorer, Probe finds the nearest hidden relic (◈).',
      anchor: c => handCard(c.player.hand.find(card => card.key === 'probe').id) },
    { id: 'relic-located', when: c => Object.values(c.state.planets).some(p => p.special === 'relic' && !p.relicClaimed && port.relicKnown(c.state.clusters[p.cluster])), title: 'Relic located', rule: 'excavation',
      text: () => `On the ◈, the same card excavates it: ${costText(port.excavationCost)}, +2★.`,
      anchor: c => { const [coord] = Object.entries(c.state.planets).find(([, p]) => p.special === 'relic' && !p.relicClaimed && port.relicKnown(c.state.clusters[p.cluster])) || []; return coord && hex(coord); } },
    { id: 'capacity-full', when: c => c.myTurn && port.resources.some(r => c.player.resources[r] >= port.limits()[r]), title: 'A full resource', rule: 'resources',
      text: () => { const r = port.resources.find(x => port.state.players[port.me].resources[x] >= port.limits()[x]); return `Your ${RESOURCE_NAMES[r]} is at its limit: any more is lost.`; },
      anchor: () => { const r = port.resources.find(x => port.state.players[port.me].resources[x] >= port.limits()[x]); return firstShown(`#resource-grid .resource-box[data-resource="${r}"]`); },
      show: () => { const r = port.resources.find(x => port.state.players[port.me].resources[x] >= port.limits()[x]); return { callouts: [{ el: firstShown(`#resource-grid .resource-box[data-resource="${r}"] i.cap`), label: 'Limit', side: 'left' }] }; } },
    { id: 'capacity-module', when: c => c.ops && c.player.hand.some(card => card.key === 'capacityModule'), title: 'Capacity Module card', rule: 'storage-allocation',
      text: () => 'Play it to add 4 points to your limits, for good.',
      anchor: c => handCard(c.player.hand.find(card => card.key === 'capacityModule').id) },
    { id: 'combat', when: c => Boolean(c.state.pendingCombat), inDialog: '#combat-dialog', title: 'Battle', rule: 'combat',
      text: () => 'Each volley, pick one tactic: Fire adds a hit, Screen blocks 2.' },
    { id: 'halfway', when: c => port.prestige(c.me) >= port.victoryTarget() / 2, title: 'Halfway there', rule: 'victory',
      text: () => `You have ${port.prestige(port.me)}★; the goal is ${port.victoryTarget()}★ at a round’s end.`,
      anchor: () => firstShown('[data-score-player="0"]') },
  ];

  // Your hexes that produce, for the Production moment.
  function producers(c) {
    return Object.entries(c.state.planets).filter(([, p]) => p.owner === c.me && port.resources.includes(p.type) && (p.hasColony || p.upgrade)).map(([k]) => k);
  }

  // ---- The per-turn hint: the one most useful next step. ----
  function hint(c) {
    const s = c.state;
    if (s.winner !== null || port.overflow() >= 0) return null;
    if (s.pendingCombat) return null;
    if (c.ops) {
      if (s.pendingConstruct) return { title: 'Build again?', text: 'You may pay for a second build now: choose a lit hex. Or choose Finish to end your turn.', anchor: firstShown('#finish-construct') };
      if (s.actionMode && ['move', 'construct', 'colonize'].includes(s.actionMode)) {
        const target = firstShown('.hex.cf-drop-target', '.hex.target');
        return { title: 'Choose a lit hex', text: !target ? 'No hex can take this order now: choose Cancel order on the card.' : s.moveSource ? 'Choose a lit hex to move there (your own hex just stays put).' : 'Choose a lit hex for this order.', anchor: target };
      }
      if (s.actionMode === 'excavate') return { title: 'Choose your relic', text: 'Choose one of the three relic cards. You pay the excavation cost and gain 2★.', anchor: firstShown('#relic-row .game-card') };
      const card = kind => c.playable.find(p => p.kind === kind || p.def.order === kind);
      // The opening: first a Data Harvester (2 Data a round pays for Explorers, excavation and
      // upgrades), then a Shipyard. Each says what to do with this turn's cards.
      const goals = [];
      const dataHex = c.colonies.flatMap(col => Object.keys(s.planets).filter(k => s.planets[k].cluster === s.planets[col].cluster && hexDistance(k, col) === 1 && s.planets[k].type === 'data' && !s.planets[k].upgrade))[0];
      const yardSite = c.colonies.flatMap(col => Object.keys(s.planets).filter(k => s.planets[k].cluster === s.planets[col].cluster && hexDistance(k, col) === 1 && !s.planets[k].upgrade && s.planets[k].type !== 'data'))[0] || null;
      if (!c.harvesters.length && dataHex) goals.push({ kind: 'harvester', name: 'Data Harvester', button: 'Build Harvester', cost: port.structures.harvester.cost, site: dataHex, why: '+2 Data every round' });
      if (!c.shipyards.length) goals.push({ kind: 'starbase', name: 'Shipyard', button: 'Build Shipyard', cost: port.structures.starbase.cost, site: yardSite, why: 'Shipyard: builds ships' });
      const goal = goals[0];
      const matRow = r => firstShown(`#resource-grid .resource-box[data-resource="${r}"]`);
      if (goal) {
        const construct = card('construct');
        const siteHex = goal.site ? hex(goal.site) : null;
        const show = target => ({ ghost: target, callouts: siteHex ? [{ el: siteHex, label: goal.why }] : [] });
        if (construct && port.canAfford(goal.cost))
          return { title: `Build a ${goal.name}`, text: `Drag this Construct card onto the ringed hex, then choose ${goal.button}.`,
            anchor: handCard(construct.card.id), marks: siteHex ? [siteHex] : [], avoid: siteHex ? [siteHex] : [], show: show(siteHex ? { from: handCard(construct.card.id), to: siteHex } : null) };
        const short = Object.entries(goal.cost).filter(([r, n]) => c.player.resources[r] < n).map(([r]) => r);
        // Only suggest converting when it really pays for the build this turn (keeping a Construct card to build with).
        const spare = [...c.convertible]; const keep = spare.findIndex(x => x.key === 'construct'); if (keep >= 0) spare.splice(keep, 1);
        const gains = {}; for (const x of (c.canConvert ? spare : [])) for (const [r, n] of Object.entries(port.cards[x.key].resource || {})) gains[r] = (gains[r] || 0) + n;
        const reachable = Object.entries(goal.cost).every(([r, n]) => c.player.resources[r] + (gains[r] || 0) >= n);
        const convert = reachable && construct && spare.find(x => short.some(r => (port.cards[x.key].resource || {})[r]));
        if (convert) {
          const gets = Object.keys(port.cards[convert.key].resource)[0];
          return { title: `First goal: a ${goal.name}`, text: `Short of ${short.map(r => RESOURCE_NAMES[r]).join(' and ')}: drag this ${port.cards[convert.key].name} card onto your mat for ${costText(port.cards[convert.key].resource)}.`,
            anchor: handCard(convert.id), marks: siteHex ? [siteHex] : [], avoid: siteHex ? [siteHex] : [], show: show({ from: handCard(convert.id), to: matRow(gets) }) };
        }
        if (!reachable && convertFirst(c) && !c.playable.length) return convertFirst(c);
        if (!reachable) return { title: `Next: a ${goal.name}`, text: `Not affordable this round. Use your other cards, or Pass & buy.`,
          anchor: turnButton(), marks: siteHex ? [siteHex] : [], show: { callouts: [...short.map(r => ({ el: matRow(r), label: `Need more ${RESOURCE_NAMES[r]}`, side: 'left' })), ...(siteHex ? [{ el: siteHex, label: `${goal.name} here` }] : [])] } };
      }
      const colonize = card('colonize');
      if (colonize) {
        const coord = colonize.targets[0], capture = c.state.planets[coord]?.owner != null;
        const price = colonyLife(colonize.card, capture), short = c.player.resources.biomass < price;
        const target = coord && hex(coord), verb = capture ? 'Capture' : 'Found';
        return short
          ? { title: `${verb} a Colony`, text: `Your Settler is on a world center. This Colony costs ${price} Life; you have ${c.player.resources.biomass}. ${SOURCES.biomass}`, anchor: matRow('biomass'), show: { callouts: [{ el: matRow('biomass'), label: `Need ${price} Life`, side: 'left' }] } }
          : { title: `${verb} a Colony`, text: `Drag this Colonize card onto your Settler and choose ${verb} Colony (${price} Life, +3★).`, anchor: handCard(colonize.card.id), show: { ghost: target ? { from: handCard(colonize.card.id), to: target } : null, callouts: target ? [{ el: target, label: 'Your Settler' }] : [] } };
      }
      const excavate = c.playable.find(p => p.kind === 'excavate');
      if (excavate) { const at = hex(excavate.targets[0]); return { title: 'Excavate the relic', text: `Drag this Probe / Excavate card onto your Explorer and choose Excavate (${costText(port.excavationCost)}, +2★).`, anchor: handCard(excavate.card.id), show: { ghost: { from: handCard(excavate.card.id), to: at }, callouts: [{ el: at, label: 'Explorer on the ◈' }] } }; }
      const special = c.playable.find(p => p.kind === 'special');
      if (special) return { title: `Play ${special.def.name}`, text: `This card needs no hex: point at it and choose Use order.`, anchor: handCard(special.card.id) };
      const construct = card('construct');
      const yardHex = c.shipyards[0] && hex(c.shipyards[0]);
      if (construct && c.shipyards.length && !c.myUnits.settler.length) {
        const settler = port.canAfford(port.ships.settler.cost), explorer = !c.myUnits.explorer.length && port.canAfford(port.ships.explorer.cost);
        if (settler || explorer) return { title: settler ? 'Commission a Settler' : 'Commission an Explorer', text: `Drag this Construct card onto your Shipyard and choose ${settler ? 'Settler: it founds Colonies (3★ each)' : 'Explorer: it finds relics (2★ each)'}.`,
          anchor: handCard(construct.card.id), show: { ghost: { from: handCard(construct.card.id), to: yardHex }, callouts: [{ el: yardHex, label: 'Your Shipyard' }] } };
        const short = Object.entries(port.ships.settler.cost).filter(([r, n]) => c.player.resources[r] < n).map(([r]) => r);
        const conv = c.canConvert ? c.convertible.find(card => short.some(r => (port.cards[card.key].resource || {})[r])) : null;
        return { title: 'Next: a Settler', text: `A Settler needs ${short.map(r => RESOURCE_NAMES[r]).join(' and ')} you lack. ${SOURCES[short[0]]}`,
          anchor: (conv ? handCard(conv.id) : null) || matRow(short[0]), show: { ghost: conv ? { from: handCard(conv.id), to: matRow(Object.keys(port.cards[conv.key].resource)[0]) } : null, callouts: short.map(r => ({ el: matRow(r), label: `Need ${RESOURCE_NAMES[r]}`, side: 'left' })) } };
      }
      // A Settler waiting on a free world's center, but its Colonize card has not come round yet.
      const waiting = c.myUnits.settler.find(coord => port.ordersAt(coord).length === 0 && c.state.planets[coord] && c.state.clusters[c.state.planets[coord].cluster]?.center === coord && c.state.planets[coord].owner === null);
      if (waiting && !c.player.hand.some(card => port.cards[card.key].order === 'colonize'))
        return { title: 'Waiting for Colonize', text: 'Your Settler is on a free world center. Its Colonize card comes back in a later hand; leave the Settler there and use your other cards.', anchor: hex(waiting), show: { callouts: [{ el: hex(waiting), label: 'Settler: waiting here' }, { el: firstShown('#discard-button'), label: 'Colonize card: in here', side: 'left' }] } };
      // A relic already located: fly there rather than Probe again.
      const relicCoord = Object.keys(c.state.planets).find(k => { const p = c.state.planets[k]; return p.special === 'relic' && !p.relicClaimed && port.relicKnown(c.state.clusters[p.cluster]); });
      const move = card('move');
      if (relicCoord && c.myUnits.explorer.length && move && !c.myUnits.explorer.includes(relicCoord)) {
        const from = hex(c.myUnits.explorer[0]);
        return { title: 'Fly to the relic', text: 'Drag this Move card onto your Explorer and fly toward the ◈ (3 hexes per card).', anchor: handCard(move.card.id), marks: [hex(relicCoord)], show: { ghost: { from: handCard(move.card.id), to: from }, callouts: [{ el: hex(relicCoord), label: '◈ the relic' }, { el: from, label: 'Your Explorer' }] } };
      }
      const probe = c.playable.find(p => p.kind === 'probe');
      if (probe && !relicCoord) { const at = hex(probe.targets[0]); return { title: 'Probe for a relic', text: 'Drag this Probe / Excavate card onto your Explorer and choose Probe: it finds the nearest relic.', anchor: handCard(probe.card.id), show: { ghost: { from: handCard(probe.card.id), to: at }, callouts: [{ el: at, label: 'Your Explorer' }] } }; }
      if (move && c.myUnits.settler.length) {
        // Name the goal: the nearest free world center, and how far it is.
        const goal = nearestFreeWorld(c, c.myUnits.settler);
        const from = hex(c.myUnits.settler[0]);
        return { title: 'Move your Settler', text: `Drag this Move card onto your Settler and step toward ${goal ? `${goal.name}’s center (${goal.distance} hex${goal.distance === 1 ? '' : 'es'} away, dashed ring)` : 'a world nobody holds'}. Settlers move 1 hex per card, so this takes a few rounds.`,
          anchor: handCard(move.card.id), avoid: goal ? [hex(goal.center)] : [], marks: goal ? [hex(goal.center)] : [], show: { ghost: { from: handCard(move.card.id), to: from }, callouts: [{ el: from, label: 'Your Settler' }, ...(goal ? [{ el: hex(goal.center), label: `${goal.name}: found a Colony here` }] : [])] } };
      }
      if (c.playable.length) {
        const first = c.playable[0];
        return { title: 'Your turn', text: `This card has an order you can use now (cards with a gold outline do). Drag it onto a lit hex, or point at it and choose Use order.${fullWarning(c)}`, anchor: handCard(first.card.id) };
      }
      const first = convertFirst(c);
      if (first) return first;
      return { title: 'Nothing left to play', text: 'No order can be used now: choose Pass & buy.', anchor: turnButton(), show: { callouts: [{ el: turnButton(), label: 'Ends your turns this round', side: 'left' }] } };
    }
    if (c.buy) {
      const market = c.marketBuys[0];
      if (market) return { title: 'Buy cards', text: 'You can afford this card (gold outline). Choose it to buy it. It goes to your discard pile. Finish Buy when you are done.', anchor: firstShown(`[data-buy-market][data-card-id="${CSS.escape(market.id)}"]`) };
      if (port.canBuyCapacity()) return { title: 'Raise your limits', text: `A Capacity Module costs ${port.capacityCost()} of each resource. It lets you hold enough to buy bigger cards later. Or choose Finish Buy.`, anchor: firstShown('[data-capacity-offer]:not([disabled])') };
      if (c.upgrades.length && port.resources.some(r => c.player.resources[r] >= 3)) return { title: 'Upgrade a starter', text: 'Upgrade a Move or Construct card for a stronger order: pay 2 of your most plentiful resource. Or choose Finish Buy.', anchor: firstShown('#upgrade-market .game-card:not([disabled])') };
      const exchange=c.player.hand.find(card=>port.cards[card.key].effect?.bankRate);
      if(exchange) return {title:'Use a 2:1 exchange card',text:'You may play this held card during Buy. Choose the resource to give at 2:1, then trade on your mat and keep buying. The rate ends when you finish Buy.',anchor:handCard(exchange.id)};
      return { title: 'Finish Buy', text: 'Nothing here is affordable yet. Choose Finish Buy. Your resources carry over to the next round.', anchor: turnButton() };
    }
    if (!c.myTurn && s.winner === null && ['operations', 'buy'].includes(s.phase)) return { title: 'Rivals are acting', text: `${s.players[s.activePlayer].name} is taking its turn.`, anchor: firstShown(`[data-score-player="${s.activePlayer}"]`), quiet: true };
    return null;
  }

  // The nearest world center nobody holds, by ordinary hex distance from any of the given hexes.
  function nearestFreeWorld(c, from) {
    const distance = hexDistance;
    let best = null;
    for (const cluster of c.state.clusters) {
      const center = c.state.planets[cluster.center];
      if (cluster.kind !== 'world' || !center || center.owner !== null || center.hasColony) continue;
      for (const coord of from) {
        const d = distance(coord, cluster.center);
        if (!best || d < best.distance) best = { name: cluster.name, center: cluster.center, distance: d };
      }
    }
    return best;
  }

  // A Learn to play walkthrough saved part-way: offer to continue it.
  function walkthroughInProgress() {
    try { const saved = JSON.parse(localStorage.getItem('galactic-reach-tutorial-progress-v1') || 'null'); return Boolean(saved?.step > 0 && saved.stepId !== 'finished'); } catch { return false; }
  }

  // Converting into a full resource wastes it: say so before the player does it.
  // Before any "Pass & buy": leftover level I starters are discarded at round end, so convert them
  // first, unless every resource they would give is already full (then say so and pass).
  function convertFirst(c) {
    if (!c.canConvert || !c.convertible.length) return null;
    const limits = port.limits();
    const useful = c.convertible.filter(card => Object.keys(port.cards[card.key].resource || {}).some(r => c.player.resources[r] < limits[r]));
    const button = firstShown('#convert-all-button:not([hidden])');
    if (!useful.length) return { title: 'Pass & buy', text: 'Your leftover cards would only give resources you are full of. Choose Pass & buy.', anchor: turnButton(), show: { callouts: [{ el: turnButton(), label: 'Converting now would be wasted', side: 'left' }] } };
    const card = useful[0], gets = Object.keys(port.cards[card.key].resource)[0];
    return { title: 'Convert first', text: 'Unused cards are discarded at round end: convert them to resources first.',
      anchor: button || handCard(card.id), show: { ghost: { from: handCard(card.id), to: firstShown(`#resource-grid .resource-box[data-resource="${gets}"]`) }, callouts: [{ el: firstShown('#hand-row'), label: 'Discarded at round end if unused' }] } };
  }

  function fullWarning(c) {
    const limits = port.limits();
    const wasted = [...new Set(c.convertible.flatMap(card => Object.keys(port.cards[card.key].resource || {}).filter(r => c.player.resources[r] >= limits[r])))];
    return wasted.length ? ` Careful: your ${wasted.map(r => RESOURCE_NAMES[r]).join(' and ')} ${wasted.length > 1 ? 'are' : 'is'} full, so converting a card into ${wasted.length > 1 ? 'them' : 'it'} now would waste it.` : '';
  }

  // ---- The coach mark itself. ----
  function ensureCoach() {
    if (coach) return coach;
    coach = document.createElement('aside');
    coach.id = 'gr-coach';
    coach.className = 'gr-coach';
    coach.setAttribute('role', 'note');
    coach.setAttribute('aria-live', 'polite');
    coach.hidden = true;
    document.body.appendChild(coach);
    coach.addEventListener('click', event => {
      const button = event.target.closest('[data-coach]');
      if (!button) return;
      const action = button.dataset.coach;
      if (action === 'got-it') { prefs.seen[button.dataset.id] = true; savePrefs(); }
      if (action === 'hide') setEnabled(false);
      if (action === 'dismiss') { dismissed = `${port.turnSerial()}|${coach.querySelector('.gr-coach-title')?.textContent || ''}`; hide(); return; }
      if (action === 'learn') { prefs.seen.welcome = true; savePrefs(); location.href = `${location.pathname}?tutorial=1`; return; }
      if (action === 'more') { coach.dataset.expanded = String(coach.dataset.expanded !== 'true'); schedule(); return; }
      globalThis.galacticReachTutorial?.coachAction?.(action, button.dataset);
      schedule();
    });
    return coach;
  }

  function clearTargets() { targeted.forEach(element => element.classList.remove('gr-coach-target', 'gr-coach-goal')); targeted = []; }

  // Where to aim at an element: a fanned hand card shows only a strip before the next card
  // covers it, so aim at the middle of that strip (the pointer and a note's tail agree).
  function aimX(anchor) {
    const r = anchor.getBoundingClientRect();
    let right = r.right;
    const next = anchor.closest('#hand-row') && anchor.nextElementSibling?.matches?.('.game-card') ? anchor.nextElementSibling.getBoundingClientRect() : null;
    if (next && next.left > r.left && next.left < right) right = next.left;
    return (r.left + right) / 2;
  }

  // A small arrow above the one element the note means (below it near the window's top edge).
  let pointer = null;
  function placePointer(anchor) {
    if (!pointer) {
      pointer = document.createElement('div');
      pointer.className = 'gr-coach-pointer';
      pointer.setAttribute('aria-hidden', 'true');
      pointer.setAttribute('popover', 'manual');
      pointer.innerHTML = '<svg viewBox="0 0 28 30"><path d="M14 29 3 15h7V1h8v14h7z" fill="currentColor" stroke="#062026" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      document.body.appendChild(pointer);
    }
    // A whole row or panel (your hand, the mat, the score track) gets the ring but no arrow:
    // an arrow at its middle would seem to single out one card in it.
    const single = anchor && !anchor.matches('#hand-row, #resource-grid, #prestige-track, #phase-stepper, #relic-row, #sector-popover');
    // A note laid beside its anchor already points at it with its own arrow.
    const ownArrow = coach && ['top', 'bottom', 'left', 'right'].includes(coach.dataset.side) && !coach.classList.contains('docked');
    const visible = single && !ownArrow && shown(anchor) && coach && !coach.hidden && getComputedStyle(coach).display !== 'none' && getComputedStyle(coach).visibility !== 'hidden';
    if (!visible) { if (pointer.matches(':popover-open')) pointer.hidePopover(); pointer.hidden = true; return; }
    const r = anchor.getBoundingClientRect(), below = r.top < 40;
    pointer.classList.toggle('below', below);
    pointer.style.left = `${Math.round(Math.max(2, Math.min(innerWidth - 30, aimX(anchor) - 14)))}px`;
    pointer.style.top = `${Math.round(below ? r.bottom + 4 : r.top - 34)}px`;
    pointer.hidden = false;
    if (!pointer.matches(':popover-open')) pointer.showPopover();
  }

  function place(tip) {
    const box = ensureCoach();
    const dialog = $$('dialog[open]').find(d => d.matches(':modal'));
    const host = tip.inDialog && dialog?.matches(tip.inDialog) ? dialog : dialog ? null : document.body;
    if (!host) { hide(); return; }
    // On the table the note is a manual popover, so it stays above the Sector Scan popover;
    // inside a modal dialog (a battle, a choice) it sits at the top of that dialog instead.
    if (box.parentElement !== host) {
      if (box.matches(':popover-open')) box.hidePopover();
      const heading = host === document.body ? null : host.querySelector('.dialog-heading');
      if (host === document.body) host.appendChild(box); else if (heading) heading.after(box); else host.prepend(box);
      raisedOver = null;
    }
    box.classList.toggle('in-dialog', host !== document.body);
    if (host === document.body) box.setAttribute('popover', 'manual'); else box.removeAttribute('popover');
    box.classList.toggle('quiet', Boolean(tip.quiet));
    const key = JSON.stringify([tip.id, tip.title, tip.text, tip.step, tip.aside || '']);
    if (key !== lastKey) {
      lastKey = key;
      box.dataset.expanded = 'false';
      delete box.dataset.full; delete box.dataset.fit;
      const buttons = [...(tip.buttons || []), { action: 'more', label: 'More' }];
      const bar = tip.progress ? `<ol class="gr-coach-progress" aria-hidden="true">${Array.from({ length: tip.progress.lessons }, (_, i) => `<li class="${i < tip.progress.finishedLessons ? 'done' : ''}${i === tip.progress.current ? ' current' : ''}"></li>`).join('')}</ol>` : '';
      box.innerHTML = `${bar}<div class="gr-coach-eyebrow">${esc(tip.eyebrow || 'Guide')}</div><strong class="gr-coach-title">${esc(tip.title)}</strong><p class="gr-coach-text">${esc(tip.text)}</p>${tip.aside ? `<p class="gr-coach-aside">${esc(tip.aside)}</p>` : ''}${tip.rule ? `<a class="gr-coach-rule" href="rulebook.html#${esc(tip.rule)}" target="_blank" rel="noopener">Rules ↗</a>` : ''}<div class="gr-coach-actions">${buttons.map(b => `<button type="button" class="button ${b.primary ? 'button-primary' : 'button-ghost'}${b.quiet ? ' gr-coach-quiet' : ''}${b.link ? ' gr-coach-link' : ''}"${b.title ? ` title="${esc(b.title)}"` : ''} data-coach="${esc(b.action)}"${b.id ? ` data-id="${esc(b.id)}"` : ''}${b.aria ? ` aria-label="${esc(b.aria)}"` : ''}${b.action === 'more' ? ' hidden' : ''}${b.disabled ? ' disabled' : ''}>${esc(b.label)}</button>`).join('')}</div><span class="gr-coach-arrow" aria-hidden="true"></span>`;
      if (!tip.quiet && tip.text !== lastAnnounced) lastAnnounced = tip.text;
    }
    box.hidden = false;
    if (host === document.body) {
      // Raise above any popover opened since (the Sector Scan): showing again puts it on top.
      const others = $$(':popover-open').filter(el => el !== box && el !== pointer).map(el => el.id).join(',');
      if (!box.matches(':popover-open') || others !== raisedOver) {
        if (box.matches(':popover-open')) box.hidePopover(); box.showPopover(); raisedOver = others;
        if (pointer?.matches(':popover-open')) pointer.hidePopover();
      }
    }
    clearTargets();
    const anchor = host === document.body && tip.anchor && shown(tip.anchor) ? tip.anchor : null;
    if (anchor && !tip.noPulse) { anchor.classList.add('gr-coach-target'); targeted.push(anchor); }
    currentAnchor = anchor;
    currentAvoid = [...(tip.avoid || []), ...(tip.show?.callouts || []).map(c => c?.el), ...(tip.show?.spotlight || []), tip.show?.ghost?.to].filter(el => el && el !== anchor && !el.contains?.(anchor));
    pendingShow = host === document.body ? tip.show || null : null;
    // A destination the note names (a world to reach) gets a quieter dashed ring of its own.
    if (host === document.body) for (const mark of (tip.marks || []).filter(Boolean)) { mark.classList.add('gr-coach-goal'); targeted.push(mark); }
    box.classList.toggle('free', Boolean(tip.free || tip.dock));
    if (host !== document.body) {
      box.style.left = box.style.top = box.style.width = ''; box.dataset.side = 'inline'; box.classList.remove('docked'); placePointer(null);
      // A note must not push the window's own buttons (a battle's tactics) off screen: shorten it.
      const text = box.querySelector('.gr-coach-text');
      const over = Math.max(host.getBoundingClientRect().bottom - innerHeight + 8, host.scrollHeight - host.clientHeight);
      const more = box.querySelector('[data-coach="more"]');
      if (box.dataset.expanded === 'true') { if (text && box.dataset.full) text.textContent = box.dataset.full; if (more) { more.hidden = false; more.textContent = 'Less'; } return; }
      const cut = text && over > 0 && !box.dataset.full ? fitText(box, text, Math.max(60, box.offsetHeight - over)) : Boolean(box.dataset.full && text?.textContent !== box.dataset.full);
      if (more) { more.hidden = !cut; more.textContent = 'More'; }
      return;
    }
    currentDock = Boolean(tip.dock);
    box.classList.toggle('docked', Boolean(tip.dock && dockRect()));
    position(box, anchor);
  }

  // In your own games the note lies over the map key in the left column, where the table's
  // notices appear, so it never hides a hex; the pulsing ring shows what it is about.
  function dockRect() {
    const key = $('#map-legend-corner');
    if (!shown(key) || matchMedia('(max-width: 599px), (max-height: 499px)').matches) return null;
    const r = key.getBoundingClientRect();
    if (r.width < 160 || r.height < 100) return null;
    const above = $('#fleet-glance')?.getBoundingClientRect();
    // Never over your hand, piles or menu button where the key's box reaches beside them.
    let bottom = r.bottom;
    for (const el of $$('#hand-row .game-card, .pile-stats > button, #table-menu-button, #board-primary:not([hidden])')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > r.left && b.left < r.right && b.top > r.top + 40 && b.top < bottom) bottom = b.top - 6;
    }
    // The hexagon's slanted edge can reach into the key's box. Either start below every hex in
    // this column, or keep the key's height and stop short of the hexes: whichever leaves more room.
    const hexes = $$('.hex').map(h => h.getBoundingClientRect()).filter(h => h.right > r.left + 2 && h.left < r.right - 2 && h.top < bottom && h.bottom > r.top);
    const below = { left: r.left, width: r.width, top: Math.max(r.top, ...hexes.map(h => h.bottom + 2)) };
    const beside = { left: r.left, width: Math.min(r.width, ...hexes.map(h => h.left - 4 - r.left)), top: r.top };
    const area = d => Math.max(0, d.width) * Math.max(0, bottom - d.top);
    const best = [below, beside].filter(d => d.width >= 160 && bottom - d.top >= 100).sort((a, b) => area(b) - area(a))[0];
    if (!best) return null;
    return { ...best, bottom, ceiling: above?.height ? above.bottom + 8 : 10 };
  }

  // A long docked note shows its first whole sentences until you choose More, so nothing is cut.
  function fitText(box, text, room) {
    const full = box.dataset.full || text.textContent;
    box.dataset.full = full;
    text.textContent = full;
    if (box.offsetHeight <= room) return false;
    const sentences = full.split(/(?<=[.!?])\s+/);
    for (let count = sentences.length - 1; count >= 1; count--) {
      text.textContent = `${sentences.slice(0, count).join(' ')} …`;
      if (box.offsetHeight <= room) return true;
    }
    const words = sentences[0].split(/\s+/);
    for (let count = words.length - 1; count >= 4; count--) {
      text.textContent = `${words.slice(0, count).join(' ')} …`;
      if (box.offsetHeight <= room) return true;
    }
    return true;
  }

  // Beside the anchor, never over it and never off screen (the table does not scroll).
  // ---- Show, don't tell: a spotlight, labelled callouts and a ghost drag, drawn over the real
  // table (never intercepting a click). A step names the parts it talks about; the stage lights
  // them, labels them one at a time, and shows the drag it asks for. Reduced motion: all still. ----
  let pendingShow = null, currentDock = false;
  let following = false, dismissed = '';
  let stage = null, currentShow = null, showKey = '', activeCallout = 0, ghostAnimation = null, ghostKey = '';
  const reducedMotion = () => Boolean(matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const SVG = 'http://www.w3.org/2000/svg';
  // Parts of the table that carry text: a note avoids lying over them, preferring empty felt or the map.
  const TEXTY = '.game-card, .panel, #fleet-glance, .log-panel, .relic-row, .resource-box, #prestige-track, .phase-stepper, .pile-stats > button, #map-legend-corner, .map-tools, .board-heading, .console-tab, #board-primary, #open-trade, #convert-all-button';
  function ensureStage() {
    if (stage) return stage;
    stage = document.createElement('div');
    stage.className = 'gr-stage';
    stage.setAttribute('aria-hidden', 'true');
    stage.setAttribute('popover', 'manual');
    stage.innerHTML = `<svg class="gr-stage-svg" xmlns="${SVG}"><defs><mask id="gr-stage-mask" maskUnits="userSpaceOnUse"><rect class="gr-stage-all" x="0" y="0" fill="white"></rect><g class="gr-stage-holes"></g></mask><marker id="gr-stage-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#6ff3ff"></path></marker></defs><rect class="gr-stage-dim" x="0" y="0" mask="url(#gr-stage-mask)"></rect><g class="gr-stage-rings"></g><path class="gr-stage-path" marker-end="url(#gr-stage-head)"></path></svg><div class="gr-stage-labels"></div><div class="gr-stage-ghost"><span>↓</span></div>`;
    document.body.appendChild(stage);
    // One callout at a time, in the order the step names them.
    // (A still change, not an animation: it also runs under reduced motion.)
    setInterval(() => { if (currentShow?.callouts?.length > 1) { activeCallout = (activeCallout + 1) % currentShow.callouts.length; if (following) schedule(); else drawStage(); } }, 2400);
    return stage;
  }
  function setShow(show) {
    const callouts = (show?.callouts || []).filter(c => c?.el && shown(c.el));
    const spotlight = (show?.spotlight || []).filter(el => el && shown(el));
    const ghost = show?.ghost?.from && show.ghost.to && shown(show.ghost.from) && shown(show.ghost.to) ? show.ghost : null;
    currentShow = callouts.length || spotlight.length || ghost ? { callouts, spotlight, ghost, noLabels: Boolean(show?.noLabels) } : null;
    const key = currentShow ? JSON.stringify([callouts.map(c => c.label), spotlight.length, Boolean(ghost)]) : '';
    if (key !== showKey) { showKey = key; activeCallout = 0; }
    drawStage();
  }
  function hideStage() {
    if (!stage) return;
    if (stage.matches(':popover-open')) stage.hidePopover();
    ghostAnimation?.cancel(); ghostAnimation = null; ghostKey = '';
  }
  const pad = (r, n) => ({ left: r.left - n, top: r.top - n, right: r.right + n, bottom: r.bottom + n, width: r.width + 2 * n, height: r.height + 2 * n });
  function drawStage() {
    const visibleNote = coach && !coach.hidden && !coach.classList.contains('in-dialog') && getComputedStyle(coach).display !== 'none' && getComputedStyle(coach).visibility !== 'hidden';
    if (!currentShow || !visibleNote) { hideStage(); return; }
    ensureStage();
    if (!stage.matches(':popover-open')) {
      stage.showPopover();
      // The note and its arrow stay above the stage.
      if (coach.matches(':popover-open')) { coach.hidePopover(); coach.showPopover(); }
      if (pointer?.matches(':popover-open')) { pointer.hidePopover(); pointer.showPopover(); }
    }
    const W = innerWidth, H = innerHeight, svg = stage.querySelector('svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    for (const r of stage.querySelectorAll('.gr-stage-all, .gr-stage-dim')) { r.setAttribute('width', W); r.setAttribute('height', H); }
    // Spotlight: dim everything except the named parts, the note and what it points at.
    const lit = currentShow.spotlight.length ? [...currentShow.spotlight, ...currentShow.callouts.map(c => c.el), coach, currentAnchor].filter(el => el && shown(el)) : [];
    stage.classList.toggle('dimmed', lit.length > 0);
    stage.querySelector('.gr-stage-holes').innerHTML = lit.map(el => { const r = pad(el.getBoundingClientRect(), 6); return `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="10" fill="black"></rect>`; }).join('');
    // Callouts: a ring around each part and a short label; the current one is lit.
    const rings = [], labels = [];
    currentShow.callouts.forEach((c, i) => {
      const r = pad(c.el.getBoundingClientRect(), 3), active = i === activeCallout % currentShow.callouts.length;
      rings.push(`<rect class="gr-stage-ring${active ? ' active' : ''}" x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="8"></rect>`);
      const side = c.side || (r.top < 34 ? 'bottom' : 'top');
      const style = side === 'left' ? `right:${Math.round(W - r.left + 6)}px;top:${Math.round(r.top + r.height / 2)}px;transform:translateY(-50%)`
        : side === 'right' ? `left:${Math.round(r.right + 6)}px;top:${Math.round(r.top + r.height / 2)}px;transform:translateY(-50%)`
        : side === 'bottom' ? `left:${Math.round(r.left + r.width / 2)}px;top:${Math.round(r.bottom + 6)}px;transform:translateX(-50%)`
        : `left:${Math.round(r.left + r.width / 2)}px;top:${Math.round(r.top - 6)}px;transform:translate(-50%,-100%)`;
      // One label at a time (neighbouring parts' labels would overlap); every part keeps its ring.
      if (active && !currentShow.noLabels) labels.push(`<span class="gr-stage-label active" style="${style}">${esc(c.label)}</span>`);
    });
    stage.querySelector('.gr-stage-rings').innerHTML = rings.join('');
    stage.querySelector('.gr-stage-labels').innerHTML = labels.join('');
    // Ghost drag: a dashed arrow from the card to where it goes, and a card gliding along it.
    const path = stage.querySelector('.gr-stage-path'), ghostEl = stage.querySelector('.gr-stage-ghost');
    const g = currentShow.ghost;
    if (!g) { path.setAttribute('d', ''); ghostEl.hidden = true; ghostAnimation?.cancel(); ghostAnimation = null; ghostKey = ''; return; }
    const a = g.from.getBoundingClientRect(), b = g.to.getBoundingClientRect();
    const x1 = aimX(g.from), y1 = a.top + Math.min(30, a.height / 2), x2 = b.left + b.width / 2, y2 = b.top + b.height / 2;
    const cx = (x1 + x2) / 2, cy = Math.min(y1, y2) - Math.max(40, Math.abs(x2 - x1) * 0.18);
    path.setAttribute('d', `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`);
    ghostEl.hidden = reducedMotion();
    const key = [x1, y1, x2, y2].map(Math.round).join(',');
    if (!reducedMotion() && key !== ghostKey) {
      ghostKey = key; ghostAnimation?.cancel();
      const at = t => { const u = 1 - t; return [u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]; };
      const frames = [0, .25, .5, .75, 1].map(t => { const [x, y] = at(t); return { transform: `translate(${x - 22}px, ${y - 30}px)`, opacity: t === 0 ? 0 : t === 1 ? .2 : .9 }; });
      ghostAnimation = ghostEl.animate(frames, { duration: 1700, iterations: Infinity, easing: 'ease-in-out', endDelay: 500 });
    }
  }

  function position(box, anchor) {
    // Your own games' notes dock whenever the map key has room, decided again as the table settles.
    if (box.classList.contains('free') && !box.classList.contains('in-dialog')) box.classList.toggle('docked', Boolean(currentDock && dockRect()));
    positionBox(box, anchor); placePointer(anchor); drawStage();
  }
  function positionBox(box, anchor, extraAvoid = currentAvoid, { besideOnly = false } = {}) {
    const margin = 10, gap = 14, vw = innerWidth, vh = innerHeight;
    const dock = box.classList.contains('docked') ? dockRect() : null;
    if (dock) {
      // Within the map key's own area. More lets a long note grow upward over the map, because
      // you asked to read it all.
      box.style.width = `${Math.round(dock.width)}px`;
      const text = box.querySelector('.gr-coach-text'), more = box.querySelector('[data-coach="more"]');
      const expanded = box.dataset.expanded === 'true';
      const room = Math.round(expanded ? dock.bottom - dock.ceiling : dock.bottom - dock.top);
      const fit = `${lastKey}|${room}|${Math.round(dock.width)}|${expanded}`;
      if (text && box.dataset.fit !== fit) {
        box.dataset.fit = fit;
        if (more) more.hidden = false;
        // Too little room even for one sentence: drop the eyebrow and Rules link first.
        box.classList.toggle('tight', !expanded && room < 150);
        box.classList.remove('bare');
        let cut = expanded ? (text.textContent = box.dataset.full || text.textContent, false) : fitText(box, text, room);
        // Not even one sentence fits: keep the title and buttons; More shows the rest.
        if (!expanded && box.offsetHeight > room) { box.classList.add('bare', 'tight'); cut = true; }
        if (more) { more.hidden = !cut && !expanded; more.textContent = expanded ? 'Less' : 'More'; }
      }
      // A window too small even for the title and buttons: the note steps aside rather than
      // cover your hand; it returns when there is room (Guidance in the menu stays on).
      box.classList.toggle('no-room', !expanded && box.offsetHeight > room + 2);
      const tall = box.offsetHeight;
      box.style.left = `${Math.round(dock.left)}px`;
      box.style.top = `${Math.round(Math.max(expanded ? dock.ceiling : dock.top, dock.bottom - tall))}px`;
      box.dataset.side = 'none';
      return;
    }
    box.style.width = '';
    const width = box.offsetWidth, height = box.offsetHeight;
    if (!anchor) {
      const map = $('.board-map-region')?.getBoundingClientRect();
      const left = map && map.width > width ? map.left + (map.width - width) / 2 : (vw - width) / 2;
      box.style.left = `${Math.max(margin, Math.min(vw - width - margin, left))}px`;
      box.style.top = `${Math.max(margin, (map?.top ?? 0) + margin)}px`;
      box.dataset.side = 'none';
      return;
    }
    // A choice inside the Sector Scan: lay the note beside the whole scan, not over it.
    const around = anchor.closest('#sector-popover') || anchor;
    const a = around.getBoundingClientRect();
    const sides = around === anchor ? ['top', 'bottom', 'right', 'left'] : ['right', 'left', 'top', 'bottom'];
    // Level with the anchor itself, even when the note lies beside the whole Sector Scan.
    const levelY = (b => b.top + b.height / 2)(anchor.getBoundingClientRect());
    const clampX = x => Math.max(margin, Math.min(vw - width - margin, x));
    const clampY = y => Math.max(margin, Math.min(vh - height - margin, y));
    // Each side, slid along it at a few offsets, so the note can find empty felt beside its target
    // (the arrow still aims at the target from wherever the note lands on that side).
    const ax = aimX(anchor), slides = [0, -0.35, 0.35, -0.7, 0.7];
    const options = [];
    for (const k of slides) {
      options.push(
        { side: 'top', left: clampX(ax - width / 2 + k * width), top: a.top - gap - height, fits: a.top - gap - height >= margin, slide: Math.abs(k) },
        { side: 'bottom', left: clampX(ax - width / 2 + k * width), top: a.bottom + gap, fits: a.bottom + gap + height <= vh - margin, slide: Math.abs(k) },
        { side: 'right', left: a.right + gap, top: clampY(levelY - height / 2 + k * height), fits: a.right + gap + width <= vw - margin, slide: Math.abs(k) },
        { side: 'left', left: a.left - gap - width, top: clampY(levelY - height / 2 + k * height), fits: a.left - gap - width >= margin, slide: Math.abs(k) });
    }
    // A crowded corner (the discard pile, the turn button): the nearest open stretch of the map,
    // with the separate arrow on the target. Chosen only when every side would cover text.
    // A bubble with no separate arrow (the Sector Scan) stays beside its target so its own arrow can aim.
    const map = besideOnly ? null : $('.board-map-region')?.getBoundingClientRect();
    if (map?.width > width && map.height > height) {
      options.push({ side: 'none', left: Math.max(map.left, Math.min(map.right - width, ax - width / 2)), top: Math.max(map.top, Math.min(map.bottom - height, a.top - gap - height)), fits: true, slide: 1.5 });
      // While a raised card fills part of the map, any open stretch of it (nearer is better).
      for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) {
        const left = map.left + (map.width - width) * fx, top = map.top + (map.height - height) * fy;
        options.push({ side: 'none', left, top, fits: true, slide: 2 + Math.hypot(left + width / 2 - ax, top + height / 2 - (a.top + a.height / 2)) / 150 });
      }
    }
    // Of the sides that fit, prefer the one that hides least of what you may need next: the lit
    // hexes of an aimed order and an open Sector Scan.
    const avoid = [around, ...$$('.hex.cf-drop-target, .hex.target'), ...$$('#sector-popover:popover-open'), ...extraAvoid, ...$$('#hand-row .game-card, .pile-stats > button, #board-primary:not([hidden]), #resource-grid, #open-trade, #convert-all-button:not([hidden]), #prestige-track')].filter((el, i) => el && el !== box && (i === 0 || (el !== around && !around.contains(el)))).map(el => el.getBoundingClientRect());
    const covered = o => avoid.reduce((sum, r) => sum + Math.max(0, Math.min(o.left + width, r.right) - Math.max(o.left, r.left)) * Math.max(0, Math.min(o.top + height, r.bottom) - Math.max(o.top, r.top)), 0);
    const raised = $$(':is(#hand-row, .market-cards, .relic-row) .game-card:is(:hover, :focus-within), .toast').map(el => el.getBoundingClientRect());
    const texty = $$(TEXTY).filter(el => el !== around && !el.contains(around) && !around.contains(el) && shown(el)).map(el => el.getBoundingClientRect());
    const area = (o, r) => Math.max(0, Math.min(o.left + width, r.right) - Math.max(o.left, r.left)) * Math.max(0, Math.min(o.top + height, r.bottom) - Math.max(o.top, r.top));
    const hexRects = $$('.hex').map(h => h.getBoundingClientRect());
    const overHexes = o => hexRects.reduce((n, r) => n + (r.right > o.left && r.left < o.left + width && r.bottom > o.top && r.top < o.top + height ? 1 : 0), 0);
    options.forEach(o => { o.cost = Math.round(covered(o) / 100) * 10 + raised.reduce((n, r) => n + area(o, r), 0) / 10 + texty.reduce((n, r) => n + area(o, r), 0) / 15 + overHexes(o); });
    options.sort((x, y) => (x.cost + x.slide * 3) - (y.cost + y.slide * 3) || sides.indexOf(x.side) - sides.indexOf(y.side));
    const choice = options.find(o => o.fits) || { side: 'none', left: clampX(a.left), top: clampY(a.top - height - gap) };
    box.style.left = `${Math.round(choice.left)}px`;
    box.style.top = `${Math.round(choice.top)}px`;
    box.dataset.side = choice.side;
    const arrow = box.querySelector('.gr-coach-arrow');
    if (arrow) {
      const b = anchor.getBoundingClientRect();
      const along = choice.side === 'top' || choice.side === 'bottom'
        ? Math.max(14, Math.min(width - 14, aimX(anchor) - choice.left))
        : Math.max(14, Math.min(height - 14, b.top + b.height / 2 - choice.top));
      arrow.style.setProperty('--along', `${Math.round(along)}px`);
    }
  }

  function hide() { if (coach) { if (coach.matches(':popover-open')) coach.hidePopover(); coach.hidden = true; } clearTargets(); lastKey = ''; raisedOver = null; currentAnchor = null; placePointer(null); currentShow = null; hideStage(); }

  // A reshuffle happened when, between two looks, the deck grew and the discard pile emptied.
  let lastPiles = null, reshuffled = false;
  function watchPiles() {
    const p = port.state.players[port.me], now = { deck: p.deck.length, discard: p.discard.length };
    if (lastPiles && now.deck > lastPiles.deck && lastPiles.discard > 0 && now.discard < lastPiles.discard && !prefs.seen.reshuffle) reshuffled = true;
    lastPiles = now;
  }

  function update() {
    frame = 0;
    if (!port) return;
    let tip = null;
    try {
      const tutorial = globalThis.galacticReachTutorial;
      if (tutorial?.active) tip = tutorial.tip(port, api);
      else if (prefs.enabled) {
        watchPiles();
        const c = context();
        let explainer = EXPLAINERS.find(e => !prefs.seen[e.id] && e.when(c));
        // Shown for the turn it became relevant: once that turn has passed it is remembered as read,
        // so the next turn's hint takes its place even if Got it was never chosen.
        if (explainer && !c.state.pendingCombat) {
          const turn = port.turnSerial();
          if (!(explainer.id in shownAt)) shownAt[explainer.id] = turn;
          else if (shownAt[explainer.id] !== turn) { prefs.seen[explainer.id] = true; savePrefs(); explainer = EXPLAINERS.find(e => !prefs.seen[e.id] && e.when(c)); if (explainer) shownAt[explainer.id] = turn; }
        }
        if (explainer) tip = { free: true, id: explainer.id, eyebrow: 'New to you', title: explainer.title, text: explainer.text(c), rule: explainer.rule, inDialog: explainer.inDialog,
          anchor: explainer.anchor?.(c) || null, marks: explainer.marks?.(c) || [], show: explainer.show?.(c) || null, buttons: [...(explainer.buttons || []), { action: 'got-it', id: explainer.id, label: 'Got it', primary: !explainer.buttons }] };
        else {
          tip = hint(c);
          if (tip && dismissed === `${port.turnSerial()}|${tip.title}`) tip = null;
          if (tip) tip = { ...tip, free: true, eyebrow: tip.quiet ? 'Guide' : 'You can', buttons: tip.quiet ? [] : [{ action: 'dismiss', label: 'Got it' }] };
        }
      }
    } catch (error) { console.error('Guidance could not read the table.', error); tip = null; }
    if (tip?.followCallouts && tip.show?.callouts?.length) {
      const live = tip.show.callouts.filter(c => c?.el && shown(c.el));
      // The note itself names the lit part (it moves with it), so the stage draws rings without labels.
      if (live.length) { const part = live[activeCallout % live.length]; tip = { ...tip, anchor: part.el, text: `${part.label}. ${tip.text}`, step: `${tip.step}:${activeCallout % live.length}`, show: { ...tip.show, noLabels: true } }; }
    }
    following = Boolean(tip?.followCallouts);
    if (tip) { pendingShow = null; place(tip); setShow(pendingShow); settle(); } else hide();
    syncMenu();
  }

  // The table refits the map just after a render (it may move without resizing): follow it for
  // about half a second, every frame, so the note never rests on a hex while the map settles.
  let settling = 0;
  function settle() {
    const already = settling > 0;
    settling = 30;
    if (already) return;
    const step = () => {
      if (coach && !coach.hidden && coach.dataset.side !== 'inline') position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null);
      if (--settling > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function schedule() { if (!frame) frame = requestAnimationFrame(update); }

  function setEnabled(enabled) {
    prefs.enabled = enabled; savePrefs();
    if (!enabled) hide();
    schedule();
  }

  function syncMenu() {
    const toggle = $('#guide-toggle');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(prefs.enabled));
    toggle.textContent = prefs.enabled ? 'Guidance: on' : 'Guidance: off';
    toggle.hidden = Boolean(globalThis.galacticReachTutorial?.active);
  }

  function init() {
    $('#guide-toggle')?.addEventListener('click', () => setEnabled(!prefs.enabled));
    // A walkthrough in progress: the menu offers to continue it rather than start again.
    try {
      const tutorial = JSON.parse(localStorage.getItem('galactic-reach-tutorial-progress-v1') || 'null');
      const learn = $('#learn-to-play');
      if (learn && !globalThis.galacticReachTutorial?.active && walkthroughInProgress()) learn.textContent = 'Continue Learn to play';
    } catch { /* no saved walkthrough */ }
    $('#guide-reset')?.addEventListener('click', () => { prefs.seen = {}; prefs.enabled = true; savePrefs(); schedule(); });
    // A click can open a dialog or popover without a render: look again afterwards.
    document.addEventListener('click', () => setTimeout(schedule, 0), true);
    document.addEventListener('keydown', () => setTimeout(schedule, 0), true);
    document.addEventListener('pointerup', () => setTimeout(schedule, 0), true);
    for (const type of ['pointerover', 'pointerout', 'focusin']) document.addEventListener(type, event => {
      if (coach && !coach.hidden && event.target.closest?.('.game-card')) requestAnimationFrame(() => position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null));
    }, true);
    for (const dialog of $$('dialog')) dialog.addEventListener('close', () => setTimeout(schedule, 0));
    addEventListener('resize', schedule);
    // Cards animate between piles after a render, and a raised hand card moves: follow the anchor,
    // and look again now and then for a dialog or popover the table opened without a render.
    setInterval(() => { if (coach && !coach.hidden && coach.dataset.side !== 'inline' && (currentAnchor || coach.classList.contains('docked') || coach.dataset.side === 'none')) position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null); }, 250);
    setInterval(schedule, 1000);
    // Fonts arriving or the table refitting change the note's and the map key's sizes: place it again
    // before the next paint, so it never rests on a hex.
    const replace = () => { if (coach && !coach.hidden && coach.dataset.side !== 'inline') position(coach, currentAnchor && shown(currentAnchor) ? currentAnchor : null); };
    if (globalThis.ResizeObserver) {
      let replaceFrame = 0;
      const watch = new ResizeObserver(() => { if (!replaceFrame) replaceFrame = requestAnimationFrame(() => { replaceFrame = 0; replace(); }); });
      for (const el of [$('#map-legend-corner'), $('#galaxy-board'), document.documentElement]) if (el) watch.observe(el);
      ensureCoach(); watch.observe(coach);
    }
    document.fonts?.ready?.then(() => { lastKey = ''; schedule(); });
    syncMenu();
  }

  // The same bubble for any table pop-up (the Sector Scan uses it): laid beside its anchor with its
  // arrow (.gr-coach-arrow) aimed at it, never over it, and clear of lit hexes and of `avoid`.
  const anchorBubble = (box, anchor, avoid = []) => positionBox(box, anchor, avoid, { besideOnly: true });
  const api = { rendered(next) { port = next; schedule(); }, refresh: schedule, prefs, setEnabled, place, hide, handCard, hex, firstShown, shown, turnButton, costText, anchorBubble, context: () => context() };
  globalThis.galacticReachGuide = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
