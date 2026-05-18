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
      hn_created_at  DATETIME,
      collected_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_projects_stars           ON projects(stars DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_last_commit_at  ON projects(last_commit_at DESC);
    CREATE INDEX IF NOT EXISTS idx_projects_collected_at    ON projects(collected_at DESC);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  try {
    db.exec("ALTER TABLE projects ADD COLUMN hn_created_at DATETIME")
  } catch {
    // column already exists — idempotent
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_hn_created_at ON projects(hn_created_at DESC)")

  // FTS5 full-text search (regular table — stores index+content, no external-content ambiguity)
  // Migrate away from external-content FTS5 (version 1) if present
  const ftsVersion = (db.prepare("SELECT value FROM meta WHERE key = 'fts5_version'").get() as { value: string } | null)?.value
  if (ftsVersion !== "2") {
    db.exec(`
      DROP TABLE IF EXISTS projects_fts;
      DROP TRIGGER IF EXISTS projects_fts_ai;
      DROP TRIGGER IF EXISTS projects_fts_ad;
      DROP TRIGGER IF EXISTS projects_fts_au;
    `)
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS projects_fts USING fts5(
      repo_name, hn_title, description
    );

    CREATE TRIGGER IF NOT EXISTS projects_fts_ai AFTER INSERT ON projects BEGIN
      INSERT INTO projects_fts(rowid, repo_name, hn_title, description)
      VALUES (new.id, new.repo_name, new.hn_title, new.description);
    END;

    CREATE TRIGGER IF NOT EXISTS projects_fts_ad AFTER DELETE ON projects BEGIN
      DELETE FROM projects_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS projects_fts_au AFTER UPDATE ON projects BEGIN
      DELETE FROM projects_fts WHERE rowid = old.id;
      INSERT INTO projects_fts(rowid, repo_name, hn_title, description)
      VALUES (new.id, new.repo_name, new.hn_title, new.description);
    END;
  `)

  // Backfill FTS index when counts diverge (first run or after migration)
  const ftsCount  = (db.prepare("SELECT count(*) AS n FROM projects_fts").get() as { n: number }).n
  const projCount = (db.prepare("SELECT count(*) AS n FROM projects").get() as { n: number }).n
  if (ftsCount !== projCount) {
    db.exec("DELETE FROM projects_fts")
    db.prepare(`
      INSERT INTO projects_fts(rowid, repo_name, hn_title, description)
      SELECT id, repo_name, hn_title, description FROM projects
    `).run()
  }

  db.prepare("INSERT INTO meta(key,value) VALUES('fts5_version','2') ON CONFLICT(key) DO UPDATE SET value='2'").run()

  // Time-series snapshots for `hot` velocity ranking
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_snapshots (
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      snapshot_at TEXT    NOT NULL DEFAULT (DATE('now')),
      hn_score    INTEGER NOT NULL,
      hn_comments INTEGER NOT NULL,
      PRIMARY KEY (project_id, snapshot_at)
    );
    CREATE INDEX IF NOT EXISTS idx_snapshots_date ON project_snapshots(snapshot_at);
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
    hn_title, hn_score, hn_comments, hn_url, is_show_hn, hn_created_at
  ) VALUES (
    $github_url, $repo_name, $description, $language, $license,
    $stars, $forks, $open_issues, $last_commit_at,
    $hn_title, $hn_score, $hn_comments, $hn_url, $is_show_hn, $hn_created_at
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
    hn_created_at  = excluded.hn_created_at,
    updated_at     = CURRENT_TIMESTAMP
  RETURNING id
`

export function upsertProject(db: Database, project: Project): number {
  const row = db.prepare(upsertSQL).get({
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
    hn_created_at:  project.hn_created_at,
  }) as { id: number }
  return row.id
}

export function insertSnapshot(db: Database, projectId: number, hnScore: number, hnComments: number): void {
  db.prepare(`
    INSERT INTO project_snapshots (project_id, hn_score, hn_comments)
    VALUES (?, ?, ?)
    ON CONFLICT(project_id, snapshot_at) DO UPDATE SET
      hn_score    = excluded.hn_score,
      hn_comments = excluded.hn_comments
  `).run(projectId, hnScore, hnComments)
}
