//! Table storage seam: a shared table is an append-only, ordered event log.
//! The SQLite implementation keeps it in the server's existing database. A
//! ledger or contract could implement the same trait (docs/shared-tables.md).
use crate::store::Store;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::Arc;

/// One seat at a shared table. `account` is set for a person and empty for an
/// AI rival, which the table service plays with `policy`.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Seat {
    pub seat: usize,
    pub account: Option<String>,
    pub name: String,
    pub policy: Option<String>,
}
impl Seat {
    pub fn human(&self) -> bool {
        self.account.is_some()
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Table {
    pub id: String,
    pub name: String,
    pub rules: String,
    pub authority: String,
    /// `active` or `finished`.
    pub status: String,
    pub seats: Vec<Seat>,
    /// Prestige target chosen in the waiting room (rules 31.36 #victory-target).
    pub victory_target: u32,
    /// Opt-in for freshly paired tabletop games; old rows/deals preserve Undo.
    #[serde(default)]
    pub committed_only: bool,
}

/// What happened, in log order:
/// - `shuffle`: the authority ordered hidden cards (public commitment, private order);
/// - `action`: a seat's command, validated by the rules engine;
/// - `reveal`: the authority opened its commitments after the game ended.
#[derive(Clone, Debug, PartialEq)]
pub struct NewEvent {
    pub kind: &'static str,
    pub seat: Option<usize>,
    /// Safe to show every seat.
    pub public: Value,
    /// Held by the authority only: never sent to a seat during play.
    pub private: Option<Value>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Event {
    pub seq: u64,
    pub kind: String,
    pub seat: Option<usize>,
    pub public: Value,
    #[serde(skip)]
    pub private: Option<Value>,
    pub hash: String,
}

pub trait TableLog: Send + Sync {
    fn create(&self, table: &Table) -> Result<(), String>;
    fn table(&self, id: &str) -> Result<Option<Table>, String>;
    /// Tables where `account` holds a seat, newest first.
    fn tables_for(&self, account: &str) -> Result<Vec<Table>, String>;
    /// Appends `events` after `head` (the caller's last seen sequence number) in
    /// one transaction, returning the new head. Fails without writing anything if
    /// another writer moved the head first.
    fn append(&self, id: &str, head: u64, events: &[NewEvent]) -> Result<u64, String>;
    fn read(&self, id: &str) -> Result<Vec<Event>, String>;
    fn finish(&self, id: &str) -> Result<(), String>;
    /// Stores a resumable position taken after event `seq`. Like a solo save it
    /// holds the whole state, secrets included, and stays on the server. It lets
    /// a table continue after a save-compatible engine edit that would change a
    /// replay of older events. The newest few are kept.
    fn save_snapshot(&self, id: &str, seq: u64, snapshot: &Value) -> Result<(), String>;
    /// Stored positions, newest first.
    fn snapshots(&self, id: &str) -> Result<Vec<(u64, Value)>, String>;
    /// Ids of every unfinished table.
    fn active_tables(&self) -> Result<Vec<String>, String>;
}

/// Snapshots kept per table: enough to cover any Undo window.
const SNAPSHOTS_KEPT: u64 = 64;

pub fn migrate(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS gr_shared_tables(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, rules TEXT NOT NULL, authority TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active', created INTEGER NOT NULL, updated INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS gr_shared_seats(
        table_id TEXT NOT NULL REFERENCES gr_shared_tables(id) ON DELETE CASCADE,
        seat INTEGER NOT NULL, account_id TEXT REFERENCES accounts(id), name TEXT NOT NULL, policy TEXT,
        PRIMARY KEY(table_id,seat));
        CREATE INDEX IF NOT EXISTS gr_shared_seats_account ON gr_shared_seats(account_id);
        CREATE TABLE IF NOT EXISTS gr_shared_events(
        table_id TEXT NOT NULL REFERENCES gr_shared_tables(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL, kind TEXT NOT NULL, seat INTEGER, public TEXT NOT NULL, private TEXT,
        previous_hash TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY(table_id,seq));
        CREATE TABLE IF NOT EXISTS gr_shared_snapshots(
        table_id TEXT NOT NULL REFERENCES gr_shared_tables(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL,
        PRIMARY KEY(table_id,seq));",
    )?;
    // Additive: shared tables dealt before the Prestige-target setting keep 40.
    let has_target = db
        .prepare("PRAGMA table_info(gr_shared_tables)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .any(|c| c.as_deref() == Ok("victory_target"));
    if !has_target {
        db.execute_batch(
            "ALTER TABLE gr_shared_tables ADD COLUMN victory_target INTEGER NOT NULL DEFAULT 40;",
        )?;
    }
    let has_commitment = db
        .prepare("PRAGMA table_info(gr_shared_tables)")?
        .query_map([], |r| r.get::<_, String>(1))?
        .any(|c| c.as_deref() == Ok("committed_only"));
    if !has_commitment {
        db.execute_batch(
            "ALTER TABLE gr_shared_tables ADD COLUMN committed_only INTEGER NOT NULL DEFAULT 0;",
        )?;
    }
    Ok(())
}

pub struct SqliteTableLog(pub Arc<Store>);

fn sql(e: impl ToString) -> String {
    e.to_string()
}
fn seats(db: &Connection, id: &str) -> Result<Vec<Seat>, String> {
    let mut query = db
        .prepare("SELECT seat,account_id,name,policy FROM gr_shared_seats WHERE table_id=? ORDER BY seat")
        .map_err(sql)?;
    query
        .query_map([id], |r| {
            Ok(Seat {
                seat: r.get(0)?,
                account: r.get(1)?,
                name: r.get(2)?,
                policy: r.get(3)?,
            })
        })
        .map_err(sql)?
        .collect::<Result<_, _>>()
        .map_err(sql)
}
fn load(db: &Connection, id: &str) -> Result<Option<Table>, String> {
    let row = db
        .query_row(
            "SELECT name,rules,authority,status,victory_target,committed_only FROM gr_shared_tables WHERE id=?",
            [id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, u32>(4)?,
                    r.get::<_, bool>(5)?,
                ))
            },
        )
        .optional()
        .map_err(sql)?;
    let Some((name, rules, authority, status, victory_target, committed_only)) = row else {
        return Ok(None);
    };
    Ok(Some(Table {
        id: id.into(),
        name,
        rules,
        authority,
        status,
        seats: seats(db, id)?,
        victory_target,
        committed_only,
    }))
}
/// Domain-separated chain: each event commits to its predecessor. Checked
/// against a trusted head it detects edits; it is not a proof by itself.
fn chain(id: &str, previous: &str, seq: u64, event: &NewEvent, private: &str) -> String {
    let private_digest = format!("{:x}", Sha256::digest(private.as_bytes()));
    format!(
        "{:x}",
        Sha256::digest(format!(
            "galactic-reach-table-event-v1\n{id}\n{previous}\n{seq}\n{}\n{}\n{}\n{private_digest}",
            event.kind,
            event.seat.map(|s| s.to_string()).unwrap_or_default(),
            event.public
        ))
    )
}

impl TableLog for SqliteTableLog {
    fn create(&self, table: &Table) -> Result<(), String> {
        let mut db = self.0.0.lock().map_err(sql)?;
        let tx = db.transaction().map_err(sql)?;
        let now = crate::now();
        tx.execute(
            "INSERT INTO gr_shared_tables(id,name,rules,authority,status,created,updated,victory_target,committed_only) VALUES(?,?,?,?,?,?,?,?,?)",
            params![table.id, table.name, table.rules, table.authority, table.status, now, now, table.victory_target, table.committed_only],
        )
        .map_err(sql)?;
        for seat in &table.seats {
            tx.execute(
                "INSERT INTO gr_shared_seats(table_id,seat,account_id,name,policy) VALUES(?,?,?,?,?)",
                params![table.id, seat.seat, seat.account, seat.name, seat.policy],
            )
            .map_err(sql)?;
        }
        tx.commit().map_err(sql)
    }
    fn table(&self, id: &str) -> Result<Option<Table>, String> {
        let db = self.0.0.lock().map_err(sql)?;
        load(&db, id)
    }
    fn tables_for(&self, account: &str) -> Result<Vec<Table>, String> {
        let db = self.0.0.lock().map_err(sql)?;
        let ids: Vec<String> = db
            .prepare(
                "SELECT t.id FROM gr_shared_tables t JOIN gr_shared_seats s ON s.table_id=t.id
                 WHERE s.account_id=? ORDER BY t.updated DESC, t.rowid DESC",
            )
            .map_err(sql)?
            .query_map([account], |r| r.get(0))
            .map_err(sql)?
            .collect::<Result<_, _>>()
            .map_err(sql)?;
        ids.iter()
            .filter_map(|id| load(&db, id).transpose())
            .collect()
    }
    fn append(&self, id: &str, head: u64, events: &[NewEvent]) -> Result<u64, String> {
        let mut db = self.0.0.lock().map_err(sql)?;
        let tx = db.transaction().map_err(sql)?;
        let (current, mut previous): (u64, String) = tx
            .query_row(
                "SELECT seq,hash FROM gr_shared_events WHERE table_id=? ORDER BY seq DESC LIMIT 1",
                [id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(sql)?
            .unwrap_or_default();
        if current != head {
            return Err("The table moved on before this change was saved.".into());
        }
        let now = crate::now();
        let mut seq = head;
        for event in events {
            seq += 1;
            let private = event
                .private
                .as_ref()
                .map(|p| p.to_string())
                .unwrap_or_default();
            let hash = chain(id, &previous, seq, event, &private);
            tx.execute(
                "INSERT INTO gr_shared_events(table_id,seq,kind,seat,public,private,previous_hash,hash,created) VALUES(?,?,?,?,?,?,?,?,?)",
                params![id, seq, event.kind, event.seat, event.public.to_string(), event.private.as_ref().map(|p| p.to_string()), previous, hash, now],
            )
            .map_err(sql)?;
            previous = hash;
        }
        tx.execute(
            "UPDATE gr_shared_tables SET updated=? WHERE id=?",
            params![now, id],
        )
        .map_err(sql)?;
        tx.commit().map_err(sql)?;
        Ok(seq)
    }
    fn read(&self, id: &str) -> Result<Vec<Event>, String> {
        let db = self.0.0.lock().map_err(sql)?;
        let mut query = db
            .prepare("SELECT seq,kind,seat,public,private,hash FROM gr_shared_events WHERE table_id=? ORDER BY seq")
            .map_err(sql)?;
        let rows = query
            .query_map([id], |r| {
                Ok((
                    r.get::<_, u64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<usize>>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, String>(5)?,
                ))
            })
            .map_err(sql)?;
        rows.map(|row| {
            let (seq, kind, seat, public, private, hash) = row.map_err(sql)?;
            Ok(Event {
                seq,
                kind,
                seat,
                public: serde_json::from_str(&public).map_err(sql)?,
                private: private
                    .map(|p| serde_json::from_str(&p))
                    .transpose()
                    .map_err(sql)?,
                hash,
            })
        })
        .collect()
    }
    fn save_snapshot(&self, id: &str, seq: u64, snapshot: &Value) -> Result<(), String> {
        let db = self.0.0.lock().map_err(sql)?;
        db.execute(
            "INSERT INTO gr_shared_snapshots(table_id,seq,data,created) VALUES(?,?,?,?)
             ON CONFLICT(table_id,seq) DO UPDATE SET data=excluded.data",
            params![id, seq, snapshot.to_string(), crate::now()],
        )
        .map_err(sql)?;
        db.execute(
            "DELETE FROM gr_shared_snapshots WHERE table_id=? AND seq NOT IN
             (SELECT seq FROM gr_shared_snapshots WHERE table_id=? ORDER BY seq DESC LIMIT ?)",
            params![id, id, SNAPSHOTS_KEPT],
        )
        .map(|_| ())
        .map_err(sql)
    }
    fn snapshots(&self, id: &str) -> Result<Vec<(u64, Value)>, String> {
        let db = self.0.0.lock().map_err(sql)?;
        let mut query = db
            .prepare("SELECT seq,data FROM gr_shared_snapshots WHERE table_id=? ORDER BY seq DESC")
            .map_err(sql)?;
        let rows = query
            .query_map([id], |r| Ok((r.get::<_, u64>(0)?, r.get::<_, String>(1)?)))
            .map_err(sql)?;
        rows.map(|row| {
            let (seq, data) = row.map_err(sql)?;
            Ok((seq, serde_json::from_str(&data).map_err(sql)?))
        })
        .collect()
    }
    fn active_tables(&self) -> Result<Vec<String>, String> {
        let db = self.0.0.lock().map_err(sql)?;
        let mut query = db
            .prepare("SELECT id FROM gr_shared_tables WHERE status='active' ORDER BY updated DESC")
            .map_err(sql)?;
        query
            .query_map([], |r| r.get(0))
            .map_err(sql)?
            .collect::<Result<_, _>>()
            .map_err(sql)
    }
    fn finish(&self, id: &str) -> Result<(), String> {
        self.0
            .0
            .lock()
            .map_err(sql)?
            .execute(
                "UPDATE gr_shared_tables SET status='finished',updated=? WHERE id=?",
                params![crate::now(), id],
            )
            .map(|_| ())
            .map_err(sql)
    }
}
