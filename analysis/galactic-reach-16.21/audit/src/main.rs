use game_core::{GameAdapter,PlayerAgent};
use galactic_reach::{GalacticReach,agent};
use serde_json::{Value,json};
use std::{fs::File,io::{BufWriter,Write},time::Instant};
fn n(v:&Value)->u64{v.as_u64().unwrap_or(0)}
fn metrics(view:&Value,buys:&[u64;4],labels:&[String])->Value{
 let planets=view["planets"].as_object().unwrap();let fleets=view["fleets"].as_object().unwrap();
 let players:Vec<_>=(0..4).map(|seat|{
  let own:Vec<_>=planets.iter().filter(|(_,p)|p["owner"]==json!(seat)).collect();
  let homes=view["clusters"][seat]["coords"].as_array().unwrap();
  let count=|kind:&str|own.iter().filter(|(_,p)|p["upgrade"]==kind).count();
  let home_harvesters=own.iter().filter(|(coord,p)|homes.contains(&json!(coord))&&p["upgrade"]=="harvester").count();
  let units=|kind:&str|fleets.values().map(|f|n(&f[seat.to_string()][kind])).sum::<u64>();
  json!({"seat":seat,"policy":labels[seat],"prestige":view["players"][seat]["prestige"],"resources":view["players"][seat]["resources"],"colonies":own.iter().filter(|(_,p)|p["hasColony"]==true).count(),"owned":own.len(),"harvesters":count("harvester"),"homeHarvesters":home_harvesters,"shipyards":count("starbase"),"settlers":units("settler"),"explorers":units("explorer"),"fleets":units("fleet"),"relicsExcavated":view["players"][seat]["relicsExcavated"],"cardsBought":buys[seat]})
 }).collect();json!({"round":view["round"],"phase":view["phase"],"players":players})
}
fn main(){
 let stem="/private/tmp/galactic-balance-audit";let mut snapshots=BufWriter::new(File::create(format!("{stem}/rust-rounds.jsonl")).unwrap());let mut actions=BufWriter::new(File::create(format!("{stem}/rust-actions.jsonl")).unwrap());let policies=["gr-military/12","gr-economy/12","gr-expansion/12","gr-wanderer/12"];let mut summaries=vec![];
 for rotation in 0..4{
  let started=Instant::now();let map_seed=[17u8;32];let labels:Vec<_>=(0..4).map(|seat|policies[(seat+rotation)%4].to_string()).collect();
  let mut agents:Vec<Box<dyn PlayerAgent<GalacticReach>>>=(0..4).map(|seat|{let identity=(seat+rotation)%4;agent(&labels[seat],[(identity+1)as u8;32]).unwrap()}).collect();let mut game=GalacticReach::new(map_seed).unwrap();let mut buys=[0u64;4];let mut last_round=0;let mut decisions=0;let mut reason="decision_limit";let mut error=None;let mut action_counts=serde_json::Map::new();
  loop{
   let view=game.observe(0).unwrap();let round=n(&view["round"]);
   if round!=last_round{writeln!(snapshots,"{}",json!({"rotation":rotation,"decisions":decisions,"mapSeedByte":17,"agentSeedBytes":(0..4).map(|seat|((seat+rotation)%4)+1).collect::<Vec<_>>(),"state":metrics(&view,&buys,&labels)})).unwrap();snapshots.flush().unwrap();last_round=round;}
   if game.scores().is_some(){reason="terminal";break}if round>40{reason="round_limit";break}if decisions>=10000{break}
   let seat=game.active_seat().unwrap();let observation=game.observe(seat).unwrap();let legal=game.legal_actions(seat);let index=agents[seat].select_action(&observation,&legal);let action=legal[index].clone();let kind=action["type"].as_str().unwrap().to_string();let count=action_counts.entry(format!("{seat}:{kind}")).or_insert(json!(0));*count=json!(n(count)+1);
   if kind=="buy"{buys[seat]+=1;}writeln!(actions,"{}",json!({"rotation":rotation,"decision":decisions,"round":round,"seat":seat,"policy":labels[seat],"action":action})).unwrap();
   if let Err(e)=game.apply_action(seat,action){reason="error";error=Some(e);break}decisions+=1;
  }
  let final_view=game.observe(0).unwrap();let summary=json!({"rotation":rotation,"mapSeedByte":17,"policies":labels,"stopReason":reason,"error":error,"seconds":started.elapsed().as_secs_f64(),"decisions":decisions,"scores":game.scores(),"state":metrics(&final_view,&buys,&labels),"actionCounts":action_counts});println!("{}",summary);summaries.push(summary);actions.flush().unwrap();
 }
 std::fs::write(format!("{stem}/rust-summary.json"),serde_json::to_vec_pretty(&summaries).unwrap()).unwrap();
}
