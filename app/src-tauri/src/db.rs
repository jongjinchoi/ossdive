use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn db_path() -> PathBuf {
    if let Ok(p) = std::env::var("OSSDIVE_DB") {
        return PathBuf::from(p);
    }
    let home    = dirs::home_dir().expect("cannot find home directory");
    let new_dir = home.join(".ossdive");
    let new_db  = new_dir.join("ossdive.db");
    let legacy  = home.join(".ossriff").join("ossriff.db");
    if !new_db.exists() && legacy.exists() {
        let _ = std::fs::create_dir_all(&new_dir);
        let _ = std::fs::rename(&legacy, &new_db);
    }
    new_db
}

pub fn open() -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA query_only=ON;")?;
    Ok(conn)
}
