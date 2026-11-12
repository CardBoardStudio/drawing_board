// Analysis-only source transform. It does not edit app.js or change game rules.
module.exports=source=>{
 const old=`        let destination = source;
        for (let i=0;i<Math.min(range,path.length);i+=1) {
          const candidate = path[i];
          destination = candidate;
          if (hostileAt(candidate,playerId)) break;
        }`;
 const replacement=`        const cannotAttack=(card.tag || ALL_CARDS[card.key]?.tag)==='pathfinder';
        const legal=new Set(reachableFrom(source,playerId,range,cannotAttack,ships));
        let destination = null;
        for (let i=0;i<Math.min(range,path.length);i+=1) {
          const candidate = path[i];
          if (legal.has(candidate)) destination = candidate;
          if (hostileAt(candidate,playerId)) break;
        }
        if (!destination) return;`;
 if(!source.includes(old))throw Error('Ship chooser source did not match');
 source=source.replace(old,replacement);
 const play=`      performMoveOrder(id,move.source,move.destination,moveCard,{tag:definition.tag,moveGroup:move.moveGroup});
      return;`;
 if(!source.includes(play))throw Error('Move application source did not match');
 return source.replace(play,`      if (performMoveOrder(id,move.source,move.destination,moveCard,{tag:definition.tag,moveGroup:move.moveGroup})) return;`);
};
