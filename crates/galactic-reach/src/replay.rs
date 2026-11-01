use serde_json::{Value, json};
/// Initial state plus exact structural deltas: no repeated galaxy snapshots.
pub struct Trace {
    initial: Value,
    current: Value,
    frames: Vec<Value>,
    leader: Option<usize>,
    lead_changes: usize,
}
impl Trace {
    pub fn new(initial: Value) -> Self {
        Self {
            current: initial.clone(),
            initial,
            frames: vec![],
            leader: None,
            lead_changes: 0,
        }
    }
    pub fn push(&mut self, seat: usize, action: Value, next: Value) {
        let players = next["players"].as_array().unwrap();
        let top = players
            .iter()
            .map(|p| p["prestige"].as_u64().unwrap())
            .max()
            .unwrap();
        let leaders: Vec<_> = players.iter().filter(|p| p["prestige"] == top).collect();
        if leaders.len() == 1 {
            let leader = leaders[0]["seat"].as_u64().unwrap() as usize;
            if self.leader.is_some_and(|old| old != leader) {
                self.lead_changes += 1;
            }
            self.leader = Some(leader);
        }
        let mut changes = vec![];
        diff(&self.current, &next, &mut vec![], &mut changes);
        self.frames.push(json!({"seat":seat,"action":action,"round":next["round"],"phase":next["phase"],"changes":changes}));
        self.current = next;
    }
    pub fn finish(self) -> Value {
        let mut standings = self.current["players"].as_array().unwrap().clone();
        standings.sort_by_key(|p| p["rank"].as_u64().unwrap());
        let gap = standings[0]["prestige"]
            .as_u64()
            .unwrap()
            .saturating_sub(standings[1]["prestige"].as_u64().unwrap());
        let battles = self.current["battles"].as_u64().unwrap_or(0);
        let score = self.lead_changes as u64 * 40 + battles * 5 + 20u64.saturating_sub(gap) * 2;
        let summary = json!({"interest":score,"lead_changes":self.lead_changes,"battles":battles,"prestige_gap":gap,"rounds":self.current["round"],"decisions":self.frames.len(),"standings":standings.iter().map(|p|json!({"seat":p["seat"],"rank":p["rank"],"prestige":p["prestige"],"colonies":p["colonies"],"resources":p["resourceTotal"]})).collect::<Vec<_>>()});
        json!({"format":1,"summary":summary,"initial":self.initial,"frames":self.frames})
    }
}
fn diff(old: &Value, new: &Value, path: &mut Vec<Value>, out: &mut Vec<Value>) {
    if old == new {
        return;
    }
    if let (Some(a), Some(b)) = (old.as_object(), new.as_object()) {
        for key in a.keys().filter(|k| !b.contains_key(*k)) {
            path.push(json!(key));
            out.push(json!({"path":path,"remove":true}));
            path.pop();
        }
        for (key, value) in b {
            path.push(json!(key));
            if let Some(previous) = a.get(key) {
                diff(previous, value, path, out);
            } else {
                out.push(json!({"path":path,"value":value}));
            }
            path.pop();
        }
    } else if let (Some(a), Some(b)) = (old.as_array(), new.as_array())
        && a.len() == b.len()
    {
        for (i, (x, y)) in a.iter().zip(b).enumerate() {
            path.push(json!(i));
            diff(x, y, path, out);
            path.pop();
        }
    } else {
        out.push(json!({"path":path,"value":new}));
    }
}
