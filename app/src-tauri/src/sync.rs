use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::db::{config_dir, db_path, meta_path};

const REPO: &str = "jongjinchoi/ossdive";
const TAG: &str = "db-latest";
const TTL_MS: u64 = 3600 * 1000; // 1h in milliseconds (matches CLI Date.now())

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    Fresh,
    Cached,
    Updated,
    Offline,
    Missing,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncMeta {
    asset_id:   u64,
    updated_at: String,
    synced_at:  u64,
}

#[derive(Deserialize)]
struct GhAsset {
    id:         u64,
    name:       String,
    updated_at: String,
}

#[derive(Deserialize)]
struct GhRelease {
    assets: Vec<GhAsset>,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn read_meta() -> Option<SyncMeta> {
    let bytes = std::fs::read(meta_path()).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn write_meta(meta: &SyncMeta) {
    if let Ok(json) = serde_json::to_string_pretty(meta) {
        let _ = std::fs::write(meta_path(), json);
    }
}

fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("ossdive")
            .build()
            .expect("failed to build HTTP client")
    })
}

macro_rules! or_fallback {
    ($expr:expr, $db:expr) => {
        match $expr {
            Ok(v) => v,
            Err(_) => return if $db.exists() { SyncStatus::Offline } else { SyncStatus::Missing },
        }
    };
}

pub async fn sync_db() -> SyncStatus {
    // OSSDIVE_DB env bypasses sync (dev override, same as CLI)
    if std::env::var("OSSDIVE_DB").is_ok() {
        return SyncStatus::Cached;
    }

    let db   = db_path();
    let meta = tauri::async_runtime::spawn_blocking(read_meta)
        .await
        .unwrap_or(None);

    // TTL cache hit
    if let Some(ref m) = meta {
        if now_millis().saturating_sub(m.synced_at) < TTL_MS && db.exists() {
            return SyncStatus::Cached;
        }
    }

    let client = http_client();

    let url = format!(
        "https://api.github.com/repos/{}/releases/tags/{}",
        REPO, TAG
    );

    let resp = or_fallback!(
        client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await,
        db
    );
    let resp = or_fallback!(resp.error_for_status(), db);
    let release: GhRelease = or_fallback!(resp.json().await, db);

    let asset = match release.assets.into_iter().find(|a| a.name == "ossdive.db") {
        Some(a) => a,
        None => return if db.exists() { SyncStatus::Offline } else { SyncStatus::Missing },
    };

    // Same version as cached — update synced_at only
    if let Some(ref m) = meta {
        if m.updated_at == asset.updated_at && db.exists() {
            let new_meta = SyncMeta {
                asset_id:   m.asset_id,
                updated_at: m.updated_at.clone(),
                synced_at:  now_millis(),
            };
            let _ = tauri::async_runtime::spawn_blocking(move || write_meta(&new_meta)).await;
            return SyncStatus::Fresh;
        }
    }

    // Download to .tmp, then atomic rename
    let dl_url = format!(
        "https://api.github.com/repos/{}/releases/assets/{}",
        REPO, asset.id
    );

    let resp = or_fallback!(
        client
            .get(&dl_url)
            .header("Accept", "application/octet-stream")
            .send()
            .await,
        db
    );
    let resp  = or_fallback!(resp.error_for_status(), db);
    let bytes = or_fallback!(resp.bytes().await, db);

    let tmp      = config_dir().join("ossdive.db.tmp");
    let db_clone = db.clone();
    let new_meta = SyncMeta {
        asset_id:   asset.id,
        updated_at: asset.updated_at,
        synced_at:  now_millis(),
    };

    let result = tauri::async_runtime::spawn_blocking(move || -> std::io::Result<()> {
        std::fs::create_dir_all(config_dir())?;
        std::fs::write(&tmp, &bytes)?;
        std::fs::rename(&tmp, &db_clone)?;
        write_meta(&new_meta);
        Ok(())
    })
    .await;

    match result {
        Ok(Ok(())) => SyncStatus::Updated,
        _ => if db.exists() { SyncStatus::Offline } else { SyncStatus::Missing },
    }
}
