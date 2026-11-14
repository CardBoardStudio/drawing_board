// Observer only. Does not draw random numbers or change authoritative rules.
// Exposed by the Rust host exclusively for completed, owner-scoped AI matches.
const replayAdapterFactory = createGalacticAdapter;
createGalacticAdapter = e => {
  const adapter = replayAdapterFactory(e);
  let battles=0;
  const apply=adapter.applyAction;
  adapter.applyAction=(seat,action)=>{const before=e.state.lastCombat;apply(seat,action);if(e.state.lastCombat!==before && e.state.lastCombat)battles++;};
  adapter.replayView=()=>{
    const s=e.state;
    const players=s.players.map((p,seat)=>({seat,resources:p.resources,...(s.version>=28?{resourceLimits:p.resourceLimits}:{}),...('combatVictories' in p?{combatVictories:p.combatVictories}:{}),...(s.version<9?{tracks:p.tracks}:{}),...(s.version>=13?{relicsExcavated:e.excavatedRelicCount(seat)}:s.version>=11?{researchStations:e.researchStationCount(seat)}:{relics:p.relics}),...(s.version>=10?{storageUpgrades:p.storageUpgrades,...(s.version>=23?{storagePurchases:p.storagePurchases||0,storageUpgradeCost:e.storageUpgradeCost(seat)}:{}),...(s.version===10?{relicRecoveries:p.relicRecoveries}:{}),capacity:e.playerCapacity(seat)}:{}),prestige:e.calculatePrestige(seat),colonies:e.colonyPlanets(seat).length,resourceTotal:e.totalResources(p),...(s.version>=27?{inPlay:p.inPlay.map(c=>({...c,name:e.ALL_CARDS[c.key].name}))}:{}),hand:p.hand.map(c=>({...c,name:e.ALL_CARDS[c.key].name})),deckCount:p.deck.length,discardCount:p.discard.length}));
    const compare=(a,b)=>b.prestige-a.prestige || b.colonies-a.colonies || b.resourceTotal-a.resourceTotal;
    players.forEach(p=>p.rank=1+players.filter(other=>compare(other,p)<0).length);
    return e.clone({round:s.round,phase:s.phase,active:s.version>=15&&s.pendingCombat?e.combatActor():s.version>=12&&e.overflowPlayer()>=0?e.overflowPlayer():s.activePlayer,winner:s.winner,players,planets:s.planets,clusters:s.clusters,fleets:s.fleets,...(s.version>=13?{relicRow:s.relicRow,relicDeckCount:s.relicDeck.length}:{}),...(s.version<12?{awards:s.awards}:{}),...(s.version<9?{policy:s.activePolicy}:{}),...(s.version===8?{policyVotes:s.policyVotes}:{}),...(s.version>=8?{pendingConsortium:s.pendingConsortium}:{}),...(s.version>=15?{pendingCombat:s.pendingCombat}:{}),log:s.log,lastCombat:s.lastCombat,tradeOffers:s.tradeOffers,battles});
  };
  return adapter;
};
