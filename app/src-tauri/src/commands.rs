use serde::Serialize;
use tauri::State;

use crate::db::DbState;

#[derive(Serialize)]
pub struct Project {
    pub id: i64,
    pub github_url: String,
    pub repo_name: String,
    pub description: Option<String>,
    pub language: Option<String>,
    pub license: Option<String>,
    pub stars: i64,
    pub forks: i64,
    pub open_issues: i64,
    pub last_commit_at: Option<String>,
    pub hn_title: String,
    pub hn_score: i64,
    pub hn_comments: i64,
    pub hn_url: String,
    pub is_show_hn: bool,
    pub hn_created_at: Option<String>,
    pub collected_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct LangCount {
    pub lang: String,
    pub count: i64,
}

#[derive(Serialize)]
pub struct TopRepo {
    pub repo_name: String,
    pub stars: i64,
}

#[derive(Serialize)]
pub struct DateRange {
    pub first: String,
    pub last: String,
}

#[derive(Serialize)]
pub struct Stats {
    pub total: i64,
    pub show_hn_count: i64,
    pub by_language: Vec<LangCount>,
    pub top5_stars: Vec<TopRepo>,
    pub collected_at_range: Option<DateRange>,
}

fn row_to_project(row: &rusqlite::Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get("id")?,
        github_url: row.get("github_url")?,
        repo_name: row.get("repo_name")?,
        description: row.get("description")?,
        language: row.get("language")?,
        license: row.get("license")?,
        stars: row.get("stars")?,
        forks: row.get("forks")?,
        open_issues: row.get("open_issues")?,
        last_commit_at: row.get("last_commit_at")?,
        hn_title: row.get::<_, Option<String>>("hn_title")?.unwrap_or_default(),
        hn_score: row.get("hn_score")?,
        hn_comments: row.get("hn_comments")?,
        hn_url: row.get::<_, Option<String>>("hn_url")?.unwrap_or_default(),
        is_show_hn: row.get::<_, i64>("is_show_hn").map(|v| v != 0)?,
        hn_created_at: row.get("hn_created_at")?,
        collected_at: row.get::<_, Option<String>>("collected_at")?.unwrap_or_default(),
        updated_at: row.get::<_, Option<String>>("updated_at")?.unwrap_or_default(),
    })
}

#[tauri::command]
pub fn list_projects(
    state: State<'_, DbState>,
    sort_by: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<Project>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let sort_col = match sort_by.as_deref() {
        Some("stars") => "stars",
        Some("last_commit_at") => "last_commit_at",
        Some("collected_at") => "collected_at",
        Some("hn_created_at") => "hn_created_at",
        _ => "hn_score",
    };
    let sql = match limit {
        Some(n) => format!("SELECT * FROM projects ORDER BY {} DESC LIMIT {}", sort_col, n),
        None    => format!("SELECT * FROM projects ORDER BY {} DESC", sort_col),
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows: rusqlite::Result<Vec<Project>> = stmt
        .query_map([], row_to_project)
        .map_err(|e| e.to_string())?
        .collect();
    rows.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn open_cli() {
    let _ = std::process::Command::new("osascript")
        .args(["-e", r#"tell application "Terminal" to do script "ossriff""#])
        .spawn();
}

#[tauri::command]
pub fn get_stats(state: State<'_, DbState>) -> Result<Stats, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let show_hn_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM projects WHERE is_show_hn = 1",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT CASE WHEN language IN ('C','C++') THEN 'C/C++' \
                         ELSE COALESCE(language, 'Unknown') END as lang, \
                    COUNT(*) as count \
             FROM projects GROUP BY lang ORDER BY count DESC",
        )
        .map_err(|e| e.to_string())?;
    let by_language: rusqlite::Result<Vec<LangCount>> = stmt
        .query_map([], |r| {
            Ok(LangCount {
                lang: r.get(0)?,
                count: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect();
    let by_language = by_language.map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT repo_name, stars FROM projects ORDER BY stars DESC LIMIT 5")
        .map_err(|e| e.to_string())?;
    let top5_stars: rusqlite::Result<Vec<TopRepo>> = stmt
        .query_map([], |r| {
            Ok(TopRepo {
                repo_name: r.get(0)?,
                stars: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect();
    let top5_stars = top5_stars.map_err(|e| e.to_string())?;

    let collected_at_range: Option<DateRange> = conn
        .query_row(
            "SELECT MIN(collected_at), MAX(collected_at) FROM projects",
            [],
            |r| {
                let first: Option<String> = r.get(0)?;
                let last: Option<String> = r.get(1)?;
                Ok(first.map(|f| DateRange {
                    first: f,
                    last: last.unwrap_or_default(),
                }))
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(Stats {
        total,
        show_hn_count,
        by_language,
        top5_stars,
        collected_at_range,
    })
}
