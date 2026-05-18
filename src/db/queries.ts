import type { Database } from "bun:sqlite"
import type { Project } from "../types.ts"

export interface TrendingOpts {
  since?: string   // "7d", "30d", "1y", or ISO date — default "7d"
  limit?: number
}

export interface HotOpts {
  since?: string   // "7d", "30d", "3d", or ISO date — default "3d"
  limit?: number
}

export interface ListProjectsOpts {
  lang?:       string
  minStars?:   number
  minScore?:   number
  since?:      string   // "7d", "30d", "1y", or ISO date "2025-01-01"
  isShowHn?:   boolean
  sortBy?:     "hn_score" | "stars" | "last_commit_at" | "collected_at" | "hn_created_at"
  limit?:      number
}

export interface Stats {
  total:             number
  showHnCount:       number
  byLanguage:        { lang: string; count: number }[]
  top5Stars:         { repo_name: string; stars: number }[]
  collectedAtRange:  { first: string; last: string } | null
}

// Converts "7d", "30d", "1y", or ISO date into a SQLite datetime string
function parseSince(since: string): string | null {
  const shorthand = since.match(/^(\d+)(d|w|m|y)$/)
  if (shorthand) {
    const amount = Number(shorthand[1])
    const unit   = shorthand[2]
    const ms     = unit === "d" ? amount * 86400_000
                 : unit === "w" ? amount * 7 * 86400_000
                 : unit === "m" ? amount * 30 * 86400_000
                 : unit === "y" ? amount * 365 * 86400_000
                 : null
    if (!ms) return null
    return new Date(Date.now() - ms).toISOString()
  }

  // ISO date or datetime
  const parsed = new Date(since)
  if (!isNaN(parsed.getTime())) return parsed.toISOString()

  return null
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id:            row["id"] as number | undefined,
    github_url:    row["github_url"] as string,
    repo_name:     row["repo_name"] as string,
    description:   row["description"] as string | null,
    language:      row["language"] as string | null,
    license:       row["license"] as string | null,
    stars:         row["stars"] as number,
    forks:         row["forks"] as number,
    open_issues:   row["open_issues"] as number,
    last_commit_at: row["last_commit_at"] as string | null,
    hn_title:      row["hn_title"] as string,
    hn_score:      row["hn_score"] as number,
    hn_comments:   row["hn_comments"] as number,
    hn_url:        row["hn_url"] as string,
    is_show_hn:    Boolean(row["is_show_hn"]),
    hn_created_at: row["hn_created_at"] as string | null,
    collected_at:  row["collected_at"] as string | undefined,
    updated_at:    row["updated_at"] as string | undefined,
  }
}

export function listProjects(db: Database, opts: ListProjectsOpts = {}): Project[] {
  const {
    lang, minStars, minScore, since, isShowHn,
    sortBy = "hn_score",
    limit  = 20,
  } = opts

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (lang) {
    conditions.push("LOWER(language) = LOWER(?)")
    params.push(lang)
  }
  if (minStars !== undefined) {
    conditions.push("stars >= ?")
    params.push(minStars)
  }
  if (minScore !== undefined) {
    conditions.push("hn_score >= ?")
    params.push(minScore)
  }
  if (since) {
    const dt = parseSince(since)
    if (dt) {
      conditions.push("collected_at >= ?")
      params.push(dt)
    }
  }
  if (isShowHn !== undefined) {
    conditions.push("is_show_hn = ?")
    params.push(isShowHn ? 1 : 0)
  }

  const where  = conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
  const order  = `ORDER BY ${sortBy} DESC`
  const sql    = `SELECT * FROM projects ${where} ${order} LIMIT ?`

  const rows = db.prepare(sql).all(...params, Math.min(limit, 100)) as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export function searchProjects(db: Database, query: string, limit = 20): Project[] {
  const tokens = query.toLowerCase().match(/[a-z0-9]+/g)
  if (!tokens || tokens.length === 0) return []
  const match = tokens.map(t => `${t}*`).join(" ")  // implicit AND, prefix match (no quotes — * inside quotes is literal)
  const sql = `
    SELECT p.* FROM projects p
    JOIN projects_fts ON p.id = projects_fts.rowid
    WHERE projects_fts MATCH ?
    ORDER BY projects_fts.rank
    LIMIT ?
  `
  const rows = db.prepare(sql).all(match, Math.min(limit, 100)) as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export function getProject(db: Database, repoName: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE repo_name = ? COLLATE NOCASE").get(repoName) as Record<string, unknown> | null
  return row ? rowToProject(row) : null
}

const STOPWORDS = new Set([
  "the","a","an","and","or","for","to","of","in","on","with","is","it",
  "that","this","by","as","at","from","be","are","was","has","have","not",
  "but","its","can","use","all",
])

function keywords(text: string | null): Set<string> {
  if (!text) return new Set()
  return new Set(
    text.toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 2 && !STOPWORDS.has(w)) ?? []
  )
}

export function getTrending(db: Database, opts: TrendingOpts = {}): Project[] {
  const { since = "7d", limit = 20 } = opts
  const dt = parseSince(since) ?? parseSince("7d")!
  const sql = `
    SELECT *
    FROM projects
    WHERE hn_created_at IS NOT NULL AND hn_created_at >= ?
    ORDER BY (hn_score + hn_comments * 2) DESC
    LIMIT ?
  `
  const rows = db.prepare(sql).all(dt, Math.min(limit, 100)) as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export function findSimilar(db: Database, repoName: string, limit = 10): Project[] {
  const target = getProject(db, repoName)
  if (!target) return []

  const conditions = ["repo_name != ? COLLATE NOCASE"]
  const params: (string | number)[] = [target.repo_name]

  if (target.language) {
    conditions.push("LOWER(language) = LOWER(?)")
    params.push(target.language)
  }
  if (target.stars > 0) {
    conditions.push("stars BETWEEN ? AND ?")
    params.push(Math.floor(target.stars * 0.25), Math.ceil(target.stars * 4))
  }

  const sql = `SELECT * FROM projects WHERE ${conditions.join(" AND ")} LIMIT 200`
  const candidates = (db.prepare(sql).all(...params) as Record<string, unknown>[]).map(rowToProject)

  const targetKw = keywords(`${target.description ?? ""} ${target.hn_title ?? ""}`)

  return candidates
    .map(p => {
      const kw = keywords(`${p.description ?? ""} ${p.hn_title ?? ""}`)
      let overlap = 0
      for (const w of kw) if (targetKw.has(w)) overlap++
      return { p, rank: overlap * 10 + p.hn_score }
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map(x => x.p)
}

export function getHot(db: Database, opts: HotOpts = {}): Project[] {
  const { since = "3d", limit = 20 } = opts
  const dt = parseSince(since) ?? parseSince("3d")!
  const sql = `
    WITH latest AS (SELECT MAX(snapshot_at) AS d FROM project_snapshots),
    oldest AS (
      SELECT project_id, hn_score, hn_comments,
        ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY snapshot_at ASC) AS rn
      FROM project_snapshots
      WHERE snapshot_at >= DATE(?)
    )
    SELECT p.*,
      (n.hn_score - o.hn_score) + (n.hn_comments - o.hn_comments) * 2 AS trend_delta
    FROM projects p
    JOIN project_snapshots n ON n.project_id = p.id AND n.snapshot_at = (SELECT d FROM latest)
    JOIN oldest o ON o.project_id = p.id AND o.rn = 1
    WHERE trend_delta > 0
    ORDER BY trend_delta DESC
    LIMIT ?
  `
  const rows = db.prepare(sql).all(dt, Math.min(limit, 100)) as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export function getStats(db: Database): Stats {
  const total      = (db.prepare("SELECT COUNT(*) as n FROM projects").get() as { n: number }).n
  const showHnCount = (db.prepare("SELECT COUNT(*) as n FROM projects WHERE is_show_hn = 1").get() as { n: number }).n

  const byLanguage = db.prepare(`
    SELECT COALESCE(language, 'Unknown') as lang, COUNT(*) as count
    FROM projects
    GROUP BY lang
    ORDER BY count DESC
    LIMIT 10
  `).all() as { lang: string; count: number }[]

  const top5Stars = db.prepare(`
    SELECT repo_name, stars FROM projects ORDER BY stars DESC LIMIT 5
  `).all() as { repo_name: string; stars: number }[]

  const range = db.prepare(`
    SELECT MIN(collected_at) as first, MAX(collected_at) as last FROM projects
  `).get() as { first: string | null; last: string | null }

  return {
    total,
    showHnCount,
    byLanguage,
    top5Stars,
    collectedAtRange: range.first ? { first: range.first, last: range.last! } : null,
  }
}
