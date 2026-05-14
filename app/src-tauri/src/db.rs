use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn db_path() -> PathBuf {
    if let Ok(p) = std::env::var("OSSRIFF_DB") {
        return PathBuf::from(p);
    }
    dirs::home_dir()
        .expect("cannot find home directory")
        .join(".ossriff")
        .join("ossriff.db")
}

pub fn open() -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA query_only=ON;")?;
    Ok(conn)
}
