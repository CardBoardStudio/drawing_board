// Transport-neutral commands over the browser's rule primitives. No DOM or timers.
// Only observations and legal commands leave this closure; decks and RNG stay private.
function createGalacticAdapter(e) {
  const s = () => e.state;
  const activeSeat = () => {
    if (s().winner !== null) return null;
    const pending = e.overflowPlayer();
    return pending >= 0 ? pending : s().activePlayer;
  };
  const visible = (coord, seat) => e.clusterKnown(s().clusters[s().planets[coord].cluster], seat);
  let cached = null;
  function observe(seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return null;
    const state = s();
    return e.clone({
      seat, round: state.round, phase: state.phase, firstPlayer: state.firstPlayer, overflowPlayer: e.overflowPlayer(),
      players: state.players.map((p, id) => ({
        id, resources: p.resources, researchStations: e.researchStationCount(id), storageUpgrades: p.storageUpgrades,
        prestige: e.calculatePrestige(id), capacity: e.playerCapacity(id),
        hand: id === seat ? p.hand : undefined, discard: p.discard,
        handCount: p.hand.length, deckCount: p.deck.length,
        militaryDiscard: p.militaryDiscard, passed: p.passed
      })),
      planets: Object.fromEntries(Object.entries(state.planets).map(([coord, p]) => [coord,
        visible(coord, seat) ? { ...p } : { cluster: p.cluster, unknown: true,
          relicSignal: e.clusterScanned(state.clusters[p.cluster], seat) && p.special === 'relic' }
      ])),
      clusters: state.clusters.map(c => ({ center: c.center, coords: c.coords })),
      fleets: state.fleets, market: state.market,
      pendingConsortium: state.pendingConsortium, tradeOffers: state.tradeOffers, pendingColonyBuild: state.pendingColonyBuild
    });
  }
  function legalActions(seat) {
    if (seat === null || activeSeat() !== seat) return [];
    if (cached) return e.clone(cached);
    const state = s(), p = state.players[seat], actions = [];
    if (e.overflowPlayer() >= 0) {
      const excess = e.totalResources(p) - e.playerCapacity(seat);
      for (const resource of e.RESOURCES) for (let amount = 1; amount <= Math.min(excess,p.resources[resource]); amount++)
        actions.push({type:'discard_overflow',resource,amount});
      cached = actions;
      return e.clone(actions);
    } else if (state.phase === 'operations' && state.pendingConsortium) {
      for (const resource of e.RESOURCES) {
        if (e.canConsortiumGain(seat,resource)) actions.push({type:'consortium_gain',resource});
        for (const getType of e.RESOURCES) if (e.canConsortiumExchange(seat,resource,getType)) actions.push({type:'consortium_exchange',giveType:resource,getType});
      }
      actions.push({type:state.pendingConsortium.trades ? 'finish_consortium' : 'cancel_consortium'});

    } else if (state.phase === 'buy') {
      actions.push({ type: 'finish_buy' });
      if (p.bought < p.buyLimit) {
        state.market.forEach((card, index) => {
          if (e.canAfford(p, e.ALL_CARDS[card.key].cost, p.buyDiscountData > 0 ? 1 : 0))
            actions.push({ type: 'buy', source: 'market', index, key: card.key });
        });
        e.BASIC_MARKET.map(key=>[key,e.BASIC_CARDS[key]]).forEach(([key, def]) => {
          if (e.canAfford(p, def.cost, p.buyDiscountData > 0 ? 1 : 0)) actions.push({ type: 'buy', source: 'basic', key });
        });
      }
      [...p.hand, ...p.discard].forEach(card => {
        if (card.starter && !card.upgraded && p.resources.data >= 1) actions.push({ type: 'upgrade', card: card.id });
      });
      p.hand.forEach(card => {
        const effect = e.ALL_CARDS[card.key].buyEffect;
        if (effect && (effect !== 'manipulation' || !p.marketManipulated)) actions.push({ type: 'buy_effect', card: card.id });
      });
      p.discard.forEach(card => {
        if (p.buyStartDiscardIds.includes(card.id)) for (const resource of e.RESOURCES)
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
        if (def.wildcard) gain.data = (gain.data || 0) + def.wildcard;
        actions.push({ type: 'resource', ...base, gain });
        if (state.pendingColonyBuild) return;
        if (def.order === 'colonize') Object.keys(state.planets).forEach(coord => {
          if (e.colonizePlanet(seat, coord, { tag: def.tag }, true)) actions.push({ type: 'colonize', ...base, coord });
        });
        if (def.order === 'construct') Object.keys(state.planets).forEach(coord => {
          for (const discountResource of card.upgraded ? e.RESOURCES : [null]) {
            for (const kind of [...Object.keys(e.STRUCTURES),...Object.keys(e.SHIP_STATS)])
              if (e.constructAt(seat,coord,kind,discountResource,true)) actions.push({type:kind==='research'?'establish_station':'build',...base,coord,kind,discountResource});
          }
        });
        if (def.order === 'move') Object.entries(state.fleets).forEach(([source, group]) => {
          if (!group[seat]) return;
          for (const moveGroup of ['ships', 'explorer']) {
            const moving = e.fleetGroup(group[seat], moveGroup);
            if (!e.fleetCount(moving)) continue;
            const range = e.movementRange(moving,card);
            e.reachableFrom(source, seat, range, def.tag === 'pathfinder', moving).forEach(destination => {
              actions.push({ type: 'move', ...base, source, destination, moveGroup });
            });
          }
        });
        if (def.order === 'probe' && e.nearestUnscannedRelicCluster(seat,card.upgraded)) actions.push({ type: 'probe', ...base });
        if (def.order === 'special') {
          if (def.tag === 'terraform') Object.entries(state.planets).forEach(([coord, planet]) => {
            if (planet.owner === seat && !planet.rich && p.resources.biomass >= 2) actions.push({ type: 'terraform', ...base, coord });
          });
          else actions.push({ type: 'special', ...base });
        }
      });
    }
    if (e.canIncreaseStorage(seat)) actions.push({type:'increase_storage'});
    if (e.canManageResources(seat)) {
      for (const resource of e.RESOURCES) {
        for (let amount = 1; amount <= p.resources[resource]; amount++) actions.push({type:'discard_resources',resource,amount});
        for (const getType of e.RESOURCES) if (e.canBankTrade(seat,resource,getType)) actions.push({type:'bank_trade',giveType:resource,getType});
      }
    }
    cached = actions;
    return e.clone(actions);
  }
  function applyAction(seat, action) {
    // Match against authoritative commands, so malformed/stale/wrong-seat commands
    // cannot reach low-level mutation primitives or consume randomness.
    const stable = value => value && typeof value === 'object' ? (Array.isArray(value) ? value.map(stable) : Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))) : value;
    const canonical = JSON.stringify(stable(action));
    if (!legalActions(seat).some(a => JSON.stringify(stable(a)) === canonical)) throw new Error('Illegal action.');
    cached = null;
    const state = s(), p = state.players[seat], card = p.hand.find(c => c.id === action.card);
    const def = card && e.ALL_CARDS[card.key];
    switch (action.type) {
      case 'consortium_gain': e.consortiumGain(seat,action.resource); return;
      case 'consortium_exchange': e.consortiumExchange(seat,action.giveType,action.getType); return;
      case 'finish_consortium': e.finishConsortium(seat); return;
      case 'cancel_consortium': e.finishConsortium(seat,true); return;
      case 'increase_storage': e.increaseStorage(seat); return;
      case 'bank_trade': e.bankTrade(seat,action.giveType,action.getType); return;
      case 'discard_resources': e.discardResources(seat,action.resource,action.amount); return;
      case 'trade_offer': e.offerTrade(seat,action); return;
      case 'trade_accept': e.respondTrade(seat,action.offer,'accept'); return;
      case 'trade_reject': e.respondTrade(seat,action.offer,'reject'); return;
      case 'trade_cancel': e.cancelTrade(seat,action.offer); return;
      case 'pass': e.passOperations(seat); return;
      case 'finish_buy': e.nextBuyPlayer(); return;
      case 'resource': e.addResources(p, action.gain); e.removeHandCard(p, action.card); return;
      case 'buy': e.buyCard(seat, action.source, action.source === 'market' ? action.index : action.key); return;
      case 'upgrade': e.upgradeStarter(seat, action.card); return;
      case 'buy_effect': e.useBuyEffect(action.card, seat); return;
      case 'decommission': e.decommission(seat, action.card, action.resource); return;
      case 'discard_overflow': e.discardOverflow(seat,{[action.resource]:action.amount}); return;
      case 'finish_colony_build': e.finishColonyBuild(seat); return;
      case 'colony_build': e.finishColonyBuild(seat,action.coord,action.kind); return;
      case 'colonize': e.applyColonizeOrder(seat, action.coord, card); return;
      case 'establish_station':
      case 'build': e.constructAt(seat,action.coord,action.kind,action.discountResource); break;
      case 'move': e.executeMove(seat, action.source, action.destination, { tag: def.tag, moveGroup: action.moveGroup }); break;
      case 'probe': e.resolveProbe(seat,card); break;
      case 'terraform': p.resources.biomass -= 2; state.planets[action.coord].rich = true; break;
      case 'special': e.resolveHumanSpecial(card, def, seat); return;
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
  function snapshot() {
    const seat = activeSeat();
    return { active: seat, observation: seat === null ? null : observe(seat), legal: legalActions(seat), scores: scores() };
  }
  return { rulesVersion: 'galactic-reach/12.17', activeSeat, observe, legalActions, applyAction, scores, standings, snapshot };
}
if (typeof module !== 'undefined' && module.exports) module.exports = createGalacticAdapter;
