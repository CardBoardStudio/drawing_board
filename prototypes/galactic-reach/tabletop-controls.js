// Local-only planning and explicit confirmation. No action is queued for later.
// The authority still validates the exact sequence and legal command on commit.
globalThis.createTabletopControls = ({bar,status,current,game,send,busy}) => {
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.className='button button-ghost';b.onclick=fn;return b;};
  const dialog=el('dialog'),title=el('h2','Confirm your choice'),summary=el('ul'),notice=el('p'),confirm=button('Confirm',commit),cancel=button('Back to planning',cancelPreview);
  dialog.id='tabletop-confirm';dialog.className='tabletop-dialog';dialog.append(title,summary,notice,confirm,cancel);document.body.append(dialog);
  let pending=null,focusNonce=null;
  function cancelPreview(){pending=null;dialog.close();}
  dialog.addEventListener('cancel',()=>{pending=null;});
  function commit(){if(!pending||busy())return;
    if(current().seq!==pending.seq){notice.textContent='The table changed. Close this preview and choose again.';confirm.disabled=true;return;}
    const intents=pending.intents;pending=null;dialog.close();send(intents);
  }
  const planner=el('dialog'),planTitle=el('h2','Private reminder'),cardLabel=el('label','Card'),cards=el('select'),sectorLabel=el('label','Sector'),sector=el('input'),planNote=el('p','This reminder never plays itself. Recheck the map, then choose and confirm your action when its timing allows.');
  planner.id='tabletop-planner';planner.className='tabletop-dialog';cards.id='tabletop-plan-card';sector.id='tabletop-plan-sector';sector.placeholder='For example: 0,0';
  cardLabel.append(cards);sectorLabel.append(sector);
  planner.append(planTitle,cardLabel,sectorLabel,planNote,button('Inspect this sector',()=>{if(game()?.inspectSector?.(sector.value.trim()))planner.close();else planNote.textContent='Choose a map sector, and finish or cancel your current selection before inspecting it.';}),button('Keep reminder',()=>planner.close()));document.body.append(planner);
  const planButton=button('Plan privately',()=>{if(!sector.value&&game()?.selectedSector?.())sector.value=game().selectedSector();planner.showModal();});planButton.id='tabletop-plan';bar.append(planButton);
  const suggestion=button('',()=>{if(!game()?.inspectSector?.(suggestion.dataset.coord))status.textContent='Finish or cancel your private selection, then inspect the suggested sector.';});suggestion.hidden=true;suggestion.id='tabletop-suggestion';bar.append(suggestion);
  return {
    pending:()=>pending!==null,
    preview(intents){
      if(busy()||pending||!current()||!intents.length)return false;
      pending={seq:current().seq,intents:JSON.parse(JSON.stringify(intents))};confirm.disabled=false;
      summary.replaceChildren(...intents.map(intent=>el('li',game()?.describeChoice?.(intent)||'Review the selected action')));
      notice.textContent='Only Confirm sends this choice. Cancel to revise your selection.';dialog.showModal();return true;
    },
    update(view){
      if(pending&&pending.seq!==view.seq){confirm.disabled=true;notice.textContent='The table changed. Close this preview and choose again; nothing from this preview was sent.';}
      const selected=cards.value,hand=view.state.players[view.seat].hand;
      cards.replaceChildren(el('option','Choose a card'));
      cards.firstChild.value='';
      for(const card of hand){const option=el('option',game()?.cardName?.(card.id)||card.key);option.value=card.id;cards.append(option);}
      if(selected&&!hand.some(c=>c.id===selected)){const old=el('option','Reminder card is no longer in your hand');old.value=selected;cards.append(old);}
      cards.value=selected;
      const focus=view.board_focus;
      if(focus&&focus.nonce!==focusNonce){focusNonce=focus.nonce;suggestion.hidden=false;suggestion.dataset.coord=focus.coord;suggestion.textContent=`Board: inspect ${focus.coord}`;
        if(!pending&&!planner.open)game()?.inspectSector?.(focus.coord);
      }else if(!focus)suggestion.hidden=true;
    }
  };
};
