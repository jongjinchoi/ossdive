use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn config_dir() -> PathBuf {
    dirs::home_dir().expect("cannot find home directory").join(".ossdive")
}

pub fn meta_path() -> PathBuf {
    config_dir().join("sync-meta.json")
}

pub fn db_path() -> PathBuf {
    if let Ok(p) = std::env::var("OSSDIVE_DB") {
        return PathBuf::from(p);
    }
    let dir    = config_dir();
    let new_db = dir.join("ossdive.db");
    let legacy = dirs::home_dir().expect("cannot find home directory")
        .join(".ossriff").join("ossriff.db");
    if !new_db.exists() && legacy.exists() {
        let _ = std::fs::create_dir_all(&dir);
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
