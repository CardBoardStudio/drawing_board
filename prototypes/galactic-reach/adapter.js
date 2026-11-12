// Transport-neutral commands over the browser's rule primitives. No DOM or timers.
// Only observations and legal commands leave this closure; decks and RNG stay private.
function createGalacticAdapter(e) {
  const s = () => e.state;
  const activeSeat = () => {
    if (s().winner !== null) return null;
    if (s().pendingCombat) return e.combatActor();
    const pending = e.overflowPlayer();
    return pending >= 0 ? pending : s().activePlayer;
  };
  const visible = (coord, seat) => e.clusterKnown(s().clusters[s().planets[coord].cluster], seat);
  let cached = null;
  function observe(seat) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= 4) return null;
    const state = s();
    return e.clone({
      combat: e.combatView(seat), seat, round: state.round, phase: state.phase, firstPlayer: state.firstPlayer, overflowPlayer: e.overflowPlayer(),
      players: state.players.map((p, id) => ({
        id, resources: p.resources, relicsExcavated: e.excavatedRelicCount(id), combatVictories: p.combatVictories || 0, storageUpgrades: p.storageUpgrades,
        prestige: e.calculatePrestige(id), capacity: e.playerCapacity(id),
        hand: id === seat ? p.hand : undefined, discard: p.discard,
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
      fleets: state.fleets, market: state.market, relicRow: state.relicRow, relicDeckCount: state.relicDeck.length,
      pendingConsortium: state.pendingConsortium, tradeOffers: state.tradeOffers, pendingColonyBuild: state.pendingColonyBuild
    });
  }
  function legalActions(seat) {
    if (seat === null || activeSeat() !== seat) return [];
    if (cached) return e.clone(cached);
    const state = s(), p = state.players[seat], actions = [];
    if (state.pendingCombat) {
      cached=e.combatActions(seat);return e.clone(cached);
    }
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
        if (card.starter && !card.upgraded) for (const resource of e.RESOURCES)
          if (p.resources[resource] >= 2) actions.push({type:'upgrade',card:card.id,resource});
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
              if (e.constructAt(seat,coord,kind,discountResource,true)) actions.push({type:'build',...base,coord,kind,discountResource});
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
        if (def.order === 'probe') state.clusters.forEach(cluster=>{
          if(e.probeRelic(seat,cluster.center,card.id,true)) actions.push({type:'probe',...base,coord:cluster.center});
        });
        if (def.order === 'excavate') Object.keys(state.planets).forEach(coord=>{
          state.relicRow.forEach(relic=>{
            if(e.excavate(seat,coord,card.id,relic.id,true)) actions.push({type:'excavate',...base,coord,relic:relic.id});
          });
        });
        if (def.order === 'special') actions.push({ type: 'special', ...base });
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
      case 'combat_escape': case 'combat_stay': case 'combat_tactic': e.applyCombatAction(seat,action); return;
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
      case 'upgrade': e.upgradeStarter(seat, action.card, action.resource); return;
      case 'buy_effect': e.useBuyEffect(action.card, seat); return;
      case 'decommission': e.decommission(seat, action.card, action.resource); return;
      case 'discard_overflow': e.discardOverflow(seat,{[action.resource]:action.amount}); return;
      case 'finish_colony_build': e.finishColonyBuild(seat); return;
      case 'colony_build': e.finishColonyBuild(seat,action.coord,action.kind); return;
      case 'colonize': e.applyColonizeOrder(seat, action.coord, card); return;
      case 'build': e.constructAt(seat,action.coord,action.kind,action.discountResource); break;
      case 'move': e.performMoveOrder(seat, action.source, action.destination, card, { tag: def.tag, moveGroup: action.moveGroup }); return;
      case 'probe': e.probeRelic(seat,action.coord,action.card); return;
      case 'excavate': e.excavate(seat,action.coord,action.card,action.relic); return;
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
  return { rulesVersion: 'galactic-reach/22.27', activeSeat, observe, legalActions, applyAction, scores, standings, snapshot };
}
if (typeof module !== 'undefined' && module.exports) module.exports = createGalacticAdapter;
