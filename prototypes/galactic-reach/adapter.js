// Transport-neutral commands over the browser's rule primitives. No DOM or timers.
// Only observations and legal commands leave this closure; decks and RNG stay private.
function createGalacticAdapter(e) {
  const s = () => e.state;
  const activeSeat = () => {
    if (s().winner !== null) return null;
    if (s().pendingCombat) return e.combatActor();
    if (s().pendingRelic) return s().pendingRelic.playerId;
    const pending = e.overflowPlayer();
    return pending >= 0 ? pending : s().activePlayer;
  };
  const visible = (coord, seat) => e.clusterKnown(s().clusters[s().planets[coord].cluster], seat);
  let cached = null;
  function observe(seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return null;
    const state = s(),offers=e.marketOffers();
    return e.clone({
      portalLinks: state.portalLinks, portalMovementCost: e.PORTAL_MOVEMENT_COST, combat: e.combatView(seat), combinedProbe:true, constructDrawOnly:true, investmentPlanning:true, cardPurchasePlanning:true, goalDirectedTrading:true, tradeGoals:e.aiTradeGoals(seat), seat, round: state.round, victoryTarget: e.victoryTarget(),
      // 32.37: public card/build prices and Harvester yield, so server rivals need no rules-specific tables.
      shipCosts: Object.fromEntries(Object.entries(e.SHIP_STATS).map(([kind,stats])=>[kind,stats.cost])), harvesterYield: e.HARVESTER_YIELD, harvesterCost: e.STRUCTURES.harvester.cost, marketPaymentCosts: offers.map(card=>e.purchaseCost(state.players[seat],card.key)), marketCosts: offers.map(card => e.ALL_CARDS[card.key]?.cost || {}),
      // 34.39: printed Wonder Prestige, military card stats and the capture rule, published for the same reason.
      marketPrestige: offers.map(card => e.ALL_CARDS[card.key]?.gainPrestige || 0),
      // Printed effects are public; no deck order or private hand is included here.
      cardStats: Object.fromEntries(Object.entries(e.ALL_CARDS).map(([key,c])=>[key,{order:c.order,kind:c.kind,tag:c.tag,relicAbility:c.relicAbility||null,battleRelic:!!c.battleRelic,military:!!c.military,draw:c.effect?.draw||c.orderDraw||(c.tag==='alienEchoes'?3:0),fallbackDraw:c.fallbackDraw||0,limits:c.effect?.limits,prestige:c.effect?.prestige||0,gainPrestige:c.gainPrestige||0,buildDiscount:c.buildDiscount||null,range:c.range||0,assault:c.assault||0,pathfinder:!!c.pathfinder,secondBuild:!!c.secondBuild,colonyCost:c.colonyCost??null,keepSettler:!!c.keepSettler,colonyPrestige:c.colonyPrestige||0,bankRate:c.effect?.bankRate||0,buyEffect:c.buyEffect||null,trashSelf:!!c.effect?.trashSelf,trashStarters:c.effect?.trashStarters||0,victoryPrestige:c.victoryPrestige||0,attack:c.attack||0,shield:c.shield||0,pierce:!!c.pierce}])),
      tacticStats: Object.fromEntries(Object.entries(e.MILITARY_CARDS).map(([key, c]) => [key, { attack: c.attack || 0, shield: c.shield || 0, pierce: !!c.pierce }])),
      combatVictoryPrestige: e.COMBAT_VICTORY_PRESTIGE, captureNeedsFleet: true, phase: state.phase, firstPlayer: state.firstPlayer, overflowPlayer: e.overflowPlayer(),
      players: state.players.map((p, id) => ({
        id, bankExchangeResources:p.bankExchangeResources||[], bankTradeRates:Object.fromEntries(e.RESOURCES.map(r=>[r,e.bankTradeRate(id,r)])), resources: p.resources, relicsExcavated: e.excavatedRelicCount(id), combatVictories: p.combatVictories || 0, cardPrestige: p.cardPrestige || 0, military: p.military, storageUpgrades: p.storageUpgrades, storagePurchases: p.storagePurchases || 0, storageUpgradeCost: e.storageUpgradeCost(id), storage: p.storage || [],
        prestige: e.calculatePrestige(id), capacity: e.playerCapacity(id), resourceLimits: e.resourceLimits(id),
        hand: id === seat ? p.hand : undefined, discard: p.discard, inPlay: p.inPlay,
        handCount: p.hand.length, deckCount: p.deck.length, deckContents: id === seat ? e.deckContents(p) : undefined,
        passed: p.passed
      })),
      planets: Object.fromEntries(Object.entries(state.planets).flatMap(([coord,p])=>{
        const cluster=state.clusters[p.cluster], known=visible(coord,seat), located=e.relicKnown(cluster,seat), signal=p.special==='relic'&&located;
        if (!known) return signal ? [[coord,{cluster:p.cluster,unknown:true,relicSignal:true}]] : [];
        return [[coord,{...p,...(!located?{special:null,relicClaimed:false}:{})}]];
      })),
      clusters: state.clusters.map(c=>e.clusterKnown(c,seat)
        ? {kind:c.kind,center:c.center,coords:c.coords,surveyed:e.clusterRevealed(c,seat),located:e.relicKnown(c,seat)}
        : {kind:'unknown',center:null,coords:[],surveyed:false,located:e.relicKnown(c,seat)}),
      // Rules #storage-allocation: Capacity Modules left in the shared pile; each seat's price is storageUpgradeCost.
      capacitySupply: state.capacitySupply,
      fleets: state.fleets, simulationCatalogMarket:e.catalogMarketEnabled(), market: offers, catalogCounts:e.catalogMarketEnabled()?Object.fromEntries(offers.map(c=>[c.key,e.marketCopiesRemaining(c.key)])):null, relicRow: state.relicRow, relicDeckCount: state.relicDeck.length,
      pendingConsortium: state.pendingConsortium, tradeOffers: state.tradeOffers, pendingConstruct: state.pendingConstruct, pendingColonyBuild: state.pendingColonyBuild
    });
  }
  function legalActions(seat) {
    if(!Number.isInteger(seat)||seat<0||seat>=4||s().winner!==null)return [];
    if(activeSeat()!==seat) {
      if(!e.canManageResources(seat))return [];
      const p=s().players[seat],free=p.hand.filter(e.canConvertCard).map(card=>({type:'resource',card:card.id,key:card.key,gain:e.cardResources(card)}));
      for(const giveType of e.RESOURCES)for(const getType of e.RESOURCES)if(e.canBankTrade(seat,giveType,getType))free.push({type:'bank_trade',giveType,getType});
      return e.clone(free);
    }
    if (cached) return e.clone(cached);
    const state = s(), p = state.players[seat], actions = [];
    if(state.pendingRelic){cached=e.relicDraftActions(seat);return e.clone(cached);}
    if (state.pendingCombat) {
      cached=e.combatActions(seat);return e.clone(cached);
    }
    if (state.phase === 'operations' && state.pendingConsortium) {
      for (const resource of e.RESOURCES) {
        if (e.canConsortiumGain(seat,resource)) actions.push({type:'consortium_gain',resource});
        for (const getType of e.RESOURCES) if (e.canConsortiumExchange(seat,resource,getType)) actions.push({type:'consortium_exchange',giveType:resource,getType});
      }
      actions.push({type:state.pendingConsortium.trades ? 'finish_consortium' : 'cancel_consortium'});

    } else if (state.pendingConstruct) {
      state.tradeOffers.forEach(offer=>{
        if(e.tradeResponseAllowed(seat,offer)){actions.push({type:'trade_reject',offer:offer.id});if(!e.tradeBlockReason(seat,offer))actions.push({type:'trade_accept',offer:offer.id});}
        if(offer.status==='open'&&offer.from===seat)actions.push({type:'trade_cancel',offer:offer.id});
      });
      actions.push({type:'finish_construct'});
      for(const coord of Object.keys(state.planets))for(const kind of [...Object.keys(e.STRUCTURES),...Object.keys(e.SHIP_STATS)])
        if(e.canSecondConstruct(seat,coord,kind))actions.push({type:'second_build',coord,kind});
      p.hand.filter(e.canConvertCard).forEach(card=>actions.push({type:'resource',card:card.id,key:card.key,gain:e.cardResources(card)}));
    } else if (state.phase === 'buy') {
      actions.push({ type: 'finish_buy' });
      // #buy: any number of affordable market purchases, including refilled cards.
      e.marketOffers().forEach((card, index) => {
        if (e.canAfford(p, e.purchaseCost(p, card.key)))
          actions.push(e.catalogMarketEnabled()?{type:'buy',source:'catalog',key:card.key}:{ type: 'buy', source: 'market', index, key: card.key });
      });
      // Rules #storage-allocation: the Upgrades tray's Capacity Module pile.
      if (e.canBuyCapacity(seat)) actions.push({ type: 'buy', source: 'capacity', key: 'capacityModule' });
      [...p.hand, ...p.discard, ...p.inPlay].forEach(card => {
        if (card.starter && e.starterLevel(card)<3) for (const resource of e.RESOURCES)
          if (p.resources[resource] >= e.upgradePrice(card)) actions.push({type:'upgrade',card:card.id,resource});
      });
      p.hand.forEach(card => {
        const effect = e.ALL_CARDS[card.key].buyEffect;
        if (effect) actions.push({ type: 'buy_effect', card: card.id });
        if (e.canPlayExchange(seat,card.id)) for (const resource of e.RESOURCES) actions.push({type:'special',card:card.id,key:card.key,resource});
      });
      // Cards in hand, discard or in play when this Buy began may be trashed (#buy).
      e.trashEligibleCards(p).forEach(card => {
        for (const resource of e.RESOURCES)
          if (p.resources[resource] >= 3) actions.push({type:'decommission',card:card.id,resource});
      });
    } else if (state.phase === 'operations') {
      if (!state.pendingColonyBuild) actions.push({ type: 'pass' });
      else {
        actions.push({type:'finish_colony_build'});
        for (const coord of Object.keys(state.planets)) for (const kind of Object.keys(e.STRUCTURES))
          if(e.canColonyBuild(seat,coord,kind)) actions.push({type:'colony_build',coord,kind});
      }
      state.tradeOffers.forEach(offer=>{
        if (e.tradeResponseAllowed(seat,offer)) {
          actions.push({type:'trade_reject',offer:offer.id});
          if (!e.tradeBlockReason(seat,offer)) actions.push({type:'trade_accept',offer:offer.id});
        }
        if (offer.status==='open' && offer.from===seat) actions.push({type:'trade_cancel',offer:offer.id});
      });
      if (!p.tradeUsed) for (const giveType of e.RESOURCES) for (const getType of e.RESOURCES) {
        if (giveType===getType) continue;
        for (let giveAmount=1;giveAmount<=Math.min(5,p.resources[giveType]);giveAmount++) for (let getAmount=1;getAmount<=5;getAmount++) {
          const terms={giveType,getType,giveAmount,getAmount};
          if (e.canOfferTrade(seat,terms)) actions.push({type:'trade_offer',...terms});
        }
      }
      p.hand.forEach(card => {
        const def = e.ALL_CARDS[card.key], base = { card: card.id, key: card.key };
        const gain = e.cardResources(card);
        if (e.canConvertCard(card)) actions.push({ type: 'resource', ...base, gain });
        if (state.pendingColonyBuild) return;
        if(def.relicAbility){actions.push(...e.relicOperations(seat,card.id));return;}
        if(e.canConstructDraw(seat,card.id))actions.push({type:'construct_draw',...base});
        if (e.canOrderDraw(seat,card.id)) actions.push({type:'order_draw',...base});
        if (def.order === 'colonize') Object.keys(state.planets).forEach(coord => {
          if (e.colonizePlanet(seat, coord, { tag: def.tag }, true)) actions.push({ type: 'colonize', ...base, coord });
        });
        if (def.order === 'construct') Object.keys(state.planets).forEach(coord => {
          // 31.36 Construct cards print their own discount (Prefab Yards, World Engine); see #cards.
          const discountResource = e.buildDiscountOptions(card)[0];
          for (const kind of [...Object.keys(e.STRUCTURES),...Object.keys(e.SHIP_STATS)])
            if (e.constructAt(seat,coord,kind,discountResource,true)) actions.push({type:'build',...base,coord,kind,discountResource});
        });
        // 33.38 #movement: any chosen units of the hex, combat ships or Explorers, at the
        // slowest chosen unit's speed. The whole group is listed first for each source.
        if (def.order === 'move') Object.entries(state.fleets).forEach(([source, group]) => {
          if (!group[seat]) return;
          moveSubsets(group[seat]).forEach(units => {
            const range = e.movementRange(units,card);
            e.reachableFrom(source, seat, range, e.avoidsHostile(def.tag), units).forEach(destination => {
              actions.push({ type: 'move', ...base, source, destination, moveGroup: units.explorer ? 'explorer' : 'ships', units });
            });
          });
        });
        if (def.order === 'probe') Object.keys(state.fleets).forEach(coord=>{
          if(e.probeRelic(seat,coord,card.id,true)) actions.push({type:'probe',...base,coord});
        });
        if (['probe','excavate'].includes(def.order)) Object.keys(state.planets).forEach(coord=>{
          state.relicRow.forEach(relic=>{
            if(e.excavate(seat,coord,card.id,relic.id,true)) actions.push({type:'excavate',...base,coord,relic:relic.id});
          });
        });
        if (def.order === 'special') {
          if(def.tag==='alienCradle') for(const allocation of e.storageAllocations(e.RELIC_STORAGE_POINTS)) actions.push({type:'special',...base,allocation});
          // Capacity Module: every split of its points.
          else if(def.effect?.allocate) for(const allocation of e.storageAllocations(def.effect.allocate)) actions.push({type:'special',...base,allocation});
          // Archive Purge: each choice of up to two level I starters in discard, in discard order.
          else if(def.effect?.bankRate) { if(e.canPlayExchange(seat,card.id)) for(const resource of e.RESOURCES)actions.push({type:'special',...base,resource}); }
          else if(def.effect?.trashStarters) for(const trash of e.archivePurgeChoices(seat,def.effect.trashStarters)) actions.push({type:'special',...base,trash});
          else actions.push({ type: 'special', ...base });
        }
      });
    }
    if(state.phase==='buy'&&e.canManageResources(seat))p.hand.filter(e.canConvertCard).forEach(card=>actions.push({type:'resource',card:card.id,key:card.key,gain:e.cardResources(card)}));
    if (e.canManageResources(seat)) {
      for (const resource of e.RESOURCES) {
        for (let amount = 1; amount <= p.resources[resource]; amount++) actions.push({type:'discard_resources',resource,amount});
        for (const getType of e.RESOURCES) if (e.canBankTrade(seat,resource,getType)) actions.push({type:'bank_trade',giveType:resource,getType});
      }
    }
    cached = actions;
    return e.clone(actions);
  }
  // Every unit choice a Move order allows at one hex (rules #movement): combat ships
  // in any counts, or Explorers in any count, never both. Largest groups come first.
  function moveSubsets(fleet) {
    const subsets = [];
    for (let settler = fleet.settler || 0; settler >= 0; settler--)
      for (let ships = fleet.fleet || 0; ships >= 0; ships--)
        if (settler + ships) subsets.push({ settler, explorer: 0, fleet: ships });
    for (let explorer = fleet.explorer || 0; explorer > 0; explorer--) subsets.push({ settler: 0, explorer, fleet: 0 });
    return subsets;
  }
  // A Move command may name only `moveGroup` (the whole group, as before 33.38) or give
  // `units`; both become the one canonical shape listed by legalActions.
  function canonicalMove(seat, action) {
    if (action?.type !== 'move') return action;
    const fleet = s().fleets[action.source]?.[seat];
    const units = action.units ? Object.fromEntries(['settler', 'explorer', 'fleet'].map(type => [type, action.units[type] ?? 0]))
      : fleet && e.fleetGroup(fleet, action.moveGroup === 'explorer' ? 'explorer' : 'ships');
    if (!units) return action;
    return { ...action, units, moveGroup: units.explorer ? 'explorer' : 'ships' };
  }
  function applyAction(seat, rawAction) {
    const action = canonicalMove(seat, rawAction);
    // Match against authoritative commands, so malformed/stale/wrong-seat commands
    // cannot reach low-level mutation primitives or consume randomness.
    const stable = value => value && typeof value === 'object' ? (Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))) : value;
    const canonical = JSON.stringify(stable(action));
    if (!legalActions(seat).some(a => JSON.stringify(stable(a)) === canonical)) throw new Error('Illegal action.');
    cached = null;
    const state = s(), p = state.players[seat], card = p.hand.find(c => c.id === action.card);
    const def = card && e.ALL_CARDS[card.key];
    switch (action.type) {
      case 'relic': case 'relic_shift': case 'relic_confirm': case 'relic_cancel': e.applyRelicAction(seat,action); return;
      case 'combat_relic': case 'combat_continue': e.applyCombatAction(seat,action); return;
      case 'combat_escape': case 'combat_stay': case 'combat_tactic': e.applyCombatAction(seat,action); return;
      case 'consortium_gain': e.consortiumGain(seat,action.resource); return;
      case 'consortium_exchange': e.consortiumExchange(seat,action.giveType,action.getType); return;
      case 'finish_consortium': e.finishConsortium(seat); return;
      case 'cancel_consortium': e.finishConsortium(seat,true); return;
      case 'bank_trade': e.bankTrade(seat,action.giveType,action.getType); return;
      case 'discard_resources': e.discardResources(seat,action.resource,action.amount); return;
      case 'trade_offer': e.offerTrade(seat,action); return;
      case 'trade_accept': e.respondTrade(seat,action.offer,'accept'); return;
      case 'trade_reject': e.respondTrade(seat,action.offer,'reject'); return;
      case 'trade_cancel': e.cancelTrade(seat,action.offer); return;
      case 'pass': e.passOperations(seat); return;
      case 'finish_buy': e.nextBuyPlayer(); return;
      case 'resource': e.convertCard(seat,action.card); return;
      case 'buy': e.buyCard(seat, action.source, action.source === 'market' ? action.index : action.key); return;
      case 'upgrade': e.upgradeStarter(seat, action.card, action.resource); return;
      case 'buy_effect': e.useBuyEffect(action.card, seat); return;
      case 'decommission': e.decommission(seat, action.card, action.resource); return;
      case 'finish_construct': e.finishConstruct(seat); return;
      case 'second_build': e.finishConstruct(seat,action.coord,action.kind); return;
      case 'finish_colony_build': e.finishColonyBuild(seat); return;
      case 'colony_build': e.finishColonyBuild(seat,action.coord,action.kind); return;
      case 'colonize': e.applyColonizeOrder(seat, action.coord, card); return;
      case 'order_draw': e.useOrderDraw(seat,action.card); return;
      case 'construct_draw': e.useConstructDraw(seat,action.card); return;
      case 'build': e.performConstructOrder(seat,action.coord,action.kind,card); return;
      case 'move': e.performMoveOrder(seat, action.source, action.destination, card, { tag: def.tag, moveGroup: action.moveGroup, units: action.units }); return;
      case 'probe': e.probeRelic(seat,action.coord,action.card); return;
      case 'excavate': e.excavate(seat,action.coord,action.card,action.relic); return;
      case 'special': e.resolveHumanSpecial(card, def, seat, action.resource ?? action.trash ?? action.allocation); return;
      default: throw new Error('Unknown action.');
    }
    e.removeHandCard(p, action.card);
    e.completeAction(seat);
  }
  function standings() {
    const rows=s().players.map((p,seat)=>({seat,prestige:e.calculatePrestige(seat),colonies:e.colonyPlanets(seat).length,resources:e.totalResources(p)}));
    const compare=(a,b)=>b.prestige-a.prestige || b.colonies-a.colonies || b.resources-a.resources;
    rows.sort(compare);
    return rows.map(row=>({...row,rank:1+rows.filter(other=>compare(other,row)<0).length}));
  }
  function scores() {
    if(s().winner===null) return null;
    const rows=standings();
    return s().players.map((_,seat)=>4-rows.find(row=>row.seat===seat).rank);
  }
  // One shared-table seat's view in the live state shape the browser renders.
  // Withheld: other seats' hands, every deck's order (counts stay public, and a
  // seat sees its own deck as an unordered list), moons nobody has revealed,
  // relic sectors and relic signals this seat has not located, and an opponent's
  // committed combat tactic. Discards, cards in play, the market and units are public.
  function privateState(seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return null;
    const state = e.clone(s()), stub = n => Array.from({length:n}, () => ({hidden:true}));
    if(state.pendingRelic?.playerId!==seat)state.pendingRelic=null;
    const byKey = (a,b) => a.key < b.key ? -1 : a.key > b.key ? 1 : String(a.id) < String(b.id) ? -1 : 1;
    state.players.forEach((p, id) => {
      p.handCount = p.hand.length; p.deckCount = p.deck.length;
      if (id === seat) p.deck = [...p.deck].sort(byKey);
      // The ids a seat held when its Buy began name cards in its hand, so they stay private too.
      else { p.hand = []; p.deck = []; p.buyStartHandIds = []; }
    });
    state.probeStatus = e.probeStatus(seat);
    state.marketDecks = Object.fromEntries(Object.entries(state.marketDecks).map(([tier, deck]) => [tier, stub(deck.length)]));
    state.relicDeckCount = state.relicDeck.length;
    state.relicDeck = stub(state.relicDeck.length);
    state.planets = Object.fromEntries(Object.entries(state.planets).flatMap(([coord, planet]) => {
      const cluster = state.clusters[planet.cluster], located = e.relicKnown(cluster, seat);
      if (!e.clusterKnown(cluster, seat) && !(located && planet.special === 'relic')) return [];
      return [[coord, located ? planet : {...planet, special: null, relicClaimed: false}]];
    }));
    state.clusters = state.clusters.map(cluster => {
      const known = e.clusterKnown(cluster, seat), located = e.relicKnown(cluster, seat);
      const scannedBy = located ? [seat] : [];
      return known ? {...cluster, scannedBy} : {...cluster, scannedBy, center: located ? cluster.center : null, coords: located ? cluster.coords.filter(c => state.planets[c]) : []};
    });
    const battle = state.pendingCombat;
    if (battle) for (const side of ['attacker','defender'])
      if (battle[`${side}Id`] !== seat && battle.commitments[side] !== null) battle.commitments[side] = 'hidden';
    return state;
  }
  // Deliberate public allowlist. Never clone the authoritative state or combine
  // player views: either approach can disclose a private signal or a new field.
  function publicState() {
    const state = s();
    const cards = list => list.map(c => ({key:c.key, name:e.ALL_CARDS[c.key]?.name || c.key, level:c.level || 1}));
    const known = c => c.kind !== 'moon' || [0,1,2,3].every(seat => e.clusterRevealed(c, seat));
    const located = c => [0,1,2,3].every(seat => e.relicKnown(c, seat));
    return e.clone({
      round:state.round, phase:state.phase, active:activeSeat(), winner:state.winner,
      victoryTarget:e.victoryTarget(), boardRadius:e.BOARD_RADIUS, portalLinks:state.portalLinks,
      players:state.players.map((p,id) => ({
        id, name:p.name, color:p.color, resources:p.resources, limits:e.resourceLimits(id),
        prestige:e.calculatePrestige(id), passed:p.passed,
        handCount:p.hand.length, deckCount:p.deck.length,
        discard:cards(p.discard), inPlay:cards(p.inPlay), military:cards(p.military)
      })),
      planets:Object.fromEntries(Object.entries(state.planets).filter(([,p]) => known(state.clusters[p.cluster])).map(([coord,p]) => [coord, {
        name:p.name, type:p.type, owner:p.owner, hasColony:p.hasColony,
        upgrade:p.upgrade, upgradeLevel:p.upgradeLevel,
        relic:located(state.clusters[p.cluster]) && p.special === 'relic',
        relicClaimed:located(state.clusters[p.cluster]) && p.relicClaimed
      }])),
      fleets:Object.fromEntries(Object.entries(state.fleets).map(([coord, fleets]) => [coord,
        Object.fromEntries(Object.entries(fleets).map(([seat,f]) => [seat,{settler:f.settler||0,explorer:f.explorer||0,fleet:f.fleet||0}]))])),
      market:cards(e.marketOffers()), relicRow:cards(state.relicRow), capacitySupply:state.capacitySupply,
      // combatView already returns only public information to a nonparticipant.
      combat:e.combatView(-1)
    });
  }
  // Shared-table Undo (rulebook #shared-tables). `turn` identifies the current
  // turn; `reveal` changes whenever an action shows anyone hidden information:
  // a draw, a market or relic card turned up, a survey, a located relic, combat.
  function undoMark() {
    const state = s();
    return {
      turn: e.turnSerial,
      reveal: {
        decks: state.players.map(p => p.deck.length), market: Object.values(state.marketDecks).reduce((n, deck) => n + deck.length, 0), relics: state.relicDeck.length,
        surveys: state.clusters.map(c => c.revealedBy.length), located: state.clusters.map(c => [...c.scannedBy].sort().join('.')),
        combat: state.pendingCombat ? `${state.pendingCombat.stage}:${state.pendingCombat.volley}` : null,
        combats: state.lastCombat ? JSON.stringify(state.lastCombat.summary) : null
      }
    };
  }
  // Everything a shared table needs to resume this game later (the full state,
  // secrets included, plus the counters kept outside it). Server-side only.
  function snapshotState() {
    return e.clone({ state: s(), turnSerial: e.turnSerial, cardSerial: e.cardSerial });
  }
  // Legal choices a seat's browser cannot check from its private view alone.
  function hints(seat) {
    const actions=legalActions(seat);
    return { probe: actions.filter(a => a.type === 'probe').map(a => ({card: a.card, coord: a.coord})), relics:actions.filter(a=>a.type==='relic'||a.type.startsWith('relic_')) };
  }
  // Server-only entry point: a registered AI seat uses the unmodified browser policy.
  // Invalidate cached native commands before and after direct browser mutations.
  function browserStep(seat, profile) {
    if (activeSeat() !== seat || !['military','economy','market','expansion'].includes(profile)) throw new Error('Invalid browser policy seat or profile');
    cached = null;
    s().players[seat].strategy = profile;
    try {
      if (s().pendingCombat) e.applyCombatAction(seat, e.chooseCombatAction(e.combatView(seat), e.combatActions(seat)));
      else if (s().phase === 'operations') e.runAiOperation();
      else if (s().phase === 'buy') e.runAiBuy();
      else throw new Error('No browser policy action in this phase');
    } finally { cached = null; }
  }
  function snapshot() {
    const seat = activeSeat();
    return { active: seat, observation: seat === null ? null : observe(seat), legal: legalActions(seat), scores: scores() };
  }
  return { browserStep, rulesVersion: 'galactic-reach/39.44', activeSeat, observe, legalActions, applyAction, scores, standings, snapshot, privateState, publicState, hints, undoMark, snapshotState };
}
if (typeof module !== 'undefined' && module.exports) module.exports = createGalacticAdapter;
