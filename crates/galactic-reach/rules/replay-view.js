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
    const players=s.players.map((p,seat)=>({seat,resources:p.resources,tracks:p.tracks,relics:p.relics,prestige:e.calculatePrestige(seat),colonies:e.colonyPlanets(seat).length,resourceTotal:e.totalResources(p),hand:p.hand.map(c=>({...c,name:e.ALL_CARDS[c.key].name})),deckCount:p.deck.length,discardCount:p.discard.length}));
    const compare=(a,b)=>b.prestige-a.prestige || b.colonies-a.colonies || b.resourceTotal-a.resourceTotal;
    players.forEach(p=>p.rank=1+players.filter(other=>compare(other,p)<0).length);
    return e.clone({round:s.round,phase:s.phase,active:s.activePlayer,winner:s.winner,players,planets:s.planets,clusters:s.clusters,fleets:s.fleets,awards:s.awards,policy:s.activePolicy,log:s.log,lastCombat:s.lastCombat,tradeOffers:s.tradeOffers,battles});
  };
  return adapter;
};
