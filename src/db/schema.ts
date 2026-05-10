import { Database } from "bun:sqlite"
import type { Project } from "../types.ts"

const DEFAULT_LOOKBACK_DAYS = 30

export function openDB(path: string): Database {
  const db = new Database(path, { strict: true })
  db.exec("PRAGMA journal_mode = WAL;")

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id             INTEGER PRIMARY KEY,
      github_url     TEXT    UNIQUE NOT NULL,
      repo_name      TEXT    NOT NULL,
      description    TEXT,
      language       TEXT,
      license        TEXT,
      stars          INTEGER,
      forks          INTEGER,
      open_issues    INTEGER,
      last_commit_at DATETIME,
      hn_title       TEXT,
      hn_score       INTEGER,
      hn_comments    INTEGER,
      hn_url         TEXT,
      is_show_hn     BOOLEAN DEFAULT FALSE,
      collected_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projects_stars          ON projects(stars DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_last_commit_at ON projects(last_commit_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_collected_at   ON projects(collected_at DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  return db
}

export function getLastSince(db: Database): number {
  // COLLECT_SINCE env var overrides stored checkpoint (useful for manual backfill)
  if (process.env["COLLECT_SINCE"]) {
    const ts = Math.floor(new Date(process.env["COLLECT_SINCE"]).getTime() / 1000)
    if (!isNaN(ts)) return ts
  }

  const row = db.prepare("SELECT value FROM meta WHERE key = 'last_since'").get() as { value: string } | null
  if (row) return Number(row.value)

  // First run: go back DEFAULT_LOOKBACK_DAYS
  return Math.floor(Date.now() / 1000) - DEFAULT_LOOKBACK_DAYS * 86400
}

export function setLastSince(db: Database, since: number): void {
  db.prepare("INSERT INTO meta (key, value) VALUES ('last_since', $value) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run({
    value: String(since),
  })
}

const upsertSQL = `
  INSERT INTO projects (
    github_url, repo_name, description, language, license,
    stars, forks, open_issues, last_commit_at,
    hn_title, hn_score, hn_comments, hn_url, is_show_hn
  ) VALUES (
    $github_url, $repo_name, $description, $language, $license,
    $stars, $forks, $open_issues, $last_commit_at,
    $hn_title, $hn_score, $hn_comments, $hn_url, $is_show_hn
  )
  ON CONFLICT(github_url) DO UPDATE SET
    repo_name      = excluded.repo_name,
    description    = excluded.description,
    language       = excluded.language,
    license        = excluded.license,
    stars          = excluded.stars,
    forks          = excluded.forks,
    open_issues    = excluded.open_issues,
    last_commit_at = excluded.last_commit_at,
    hn_title       = excluded.hn_title,
    hn_score       = excluded.hn_score,
    hn_comments    = excluded.hn_comments,
    hn_url         = excluded.hn_url,
    is_show_hn     = excluded.is_show_hn,
    updated_at     = CURRENT_TIMESTAMP
`

export function upsertProject(db: Database, project: Project): void {
  db.prepare(upsertSQL).run({
    github_url:     project.github_url,
    repo_name:      project.repo_name,
    description:    project.description,
    language:       project.language,
    license:        project.license,
    stars:          project.stars,
    forks:          project.forks,
    open_issues:    project.open_issues,
    last_commit_at: project.last_commit_at,
    hn_title:       project.hn_title,
    hn_score:       project.hn_score,
    hn_comments:    project.hn_comments,
    hn_url:         project.hn_url,
    is_show_hn:     project.is_show_hn ? 1 : 0,
  })
}
