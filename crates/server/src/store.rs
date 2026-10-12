use game::Game;
use rusqlite::{Connection, params};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::sync::Mutex;

pub struct Store(pub Mutex<Connection>);
impl Store {
    pub fn open(path: &str) -> Result<Self, rusqlite::Error> {
        let db = Connection::open(path)?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, state TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(game_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(game_id,revision));
        CREATE TABLE IF NOT EXISTS login_challenges(token_hash TEXT PRIMARY KEY, account TEXT, message TEXT, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, development INTEGER NOT NULL, expires INTEGER NOT NULL);")?;
        crate::accounts::migrate(&db)?;
        crate::nido::migrate(&db)?;
        crate::arena::migrate(&db)?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(Self(Mutex::new(db)))
    }
    pub fn load(db: &Connection, id: &str) -> Result<Game, String> {
        let json: String = db
            .query_row("SELECT state FROM games WHERE id=?", [id], |r| r.get(0))
            .map_err(|_| "Playtest not found.".to_string())?;
        serde_json::from_str(&json).map_err(|_| "Could not read the saved game.".into())
    }
    /// Persist snapshot and private replay records in the same transaction.
    pub fn save(db: &mut Connection, game: &Game, records: &[Record]) -> Result<(), String> {
        let tx = db.transaction().map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO games(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state",params![game.id,serde_json::to_string(game).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        let mut previous: String = tx
            .query_row(
                "SELECT hash FROM events WHERE game_id=? ORDER BY revision DESC LIMIT 1",
                [&game.id],
                |r| r.get(0),
            )
            .unwrap_or_default();
        for record in records {
            let payload = serde_json::to_string(record).map_err(|e| e.to_string())?;
            let hash = format!(
                "{:x}",
                Sha256::digest(format!(
                    "voidwright-event-v1\n{}\n{}\n{}",
                    game.id, previous, payload
                ))
            );
            tx.execute(
                "INSERT INTO events(game_id,revision,payload,previous_hash,hash) VALUES(?,?,?,?,?)",
                params![game.id, record.revision, payload, previous, hash],
            )
            .map_err(|e| e.to_string())?;
            previous = hash;
        }
        tx.commit().map_err(|e| e.to_string())
    }
}
#[derive(Serialize)]
pub struct Record {
    pub revision: u64,
    pub actor: String,
    pub action: serde_json::Value,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn game_survives_database_close_and_reopen() {
        let path = std::env::temp_dir().join(format!(
            "drawing-board-test-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        let game = Game::new(
            "saved".into(),
            "Saved".into(),
            "a".into(),
            "Ada".into(),
            [3; 32],
            10,
        )
        .unwrap();
        {
            let store = Store::open(path.to_str().unwrap()).unwrap();
            Store::save(&mut store.0.lock().unwrap(), &game, &[]).unwrap();
        }
        {
            let store = Store::open(path.to_str().unwrap()).unwrap();
            assert_eq!(
                Store::load(&store.0.lock().unwrap(), "saved").unwrap(),
                game
            );
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn existing_session_database_migrates_without_changing_identities() {
        let path = std::env::temp_dir().join(format!(
            "drawing-board-migration-{}.sqlite",
            uuid::Uuid::new_v4()
        ));
        {
            let db = Connection::open(&path).unwrap();
            db.execute_batch("CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,name TEXT NOT NULL,development INTEGER NOT NULL,expires INTEGER NOT NULL); INSERT INTO sessions VALUES('hash','nido:existing','Existing pilot',0,9999999999);").unwrap();
        }
        for _ in 0..2 {
            let store = Store::open(path.to_str().unwrap()).unwrap();
            let db = store.0.lock().unwrap();
            let row: (String, String) = db
                .query_row(
                    "SELECT id,name FROM accounts WHERE id='nido:existing'",
                    [],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .unwrap();
            assert_eq!(row, ("nido:existing".into(), "Existing pilot".into()));
            assert_eq!(
                db.query_row("SELECT count(*) FROM sessions", [], |r| r.get::<_, u32>(0))
                    .unwrap(),
                1
            );
        }
        std::fs::remove_file(path).unwrap();
    }
}
