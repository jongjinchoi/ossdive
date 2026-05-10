import type { Database } from "bun:sqlite"
import type { Project } from "../types.ts"

export interface ListProjectsOpts {
  lang?:       string
  minStars?:   number
  minScore?:   number
  since?:      string   // "7d", "30d", "1y", or ISO date "2025-01-01"
  isShowHn?:   boolean
  sortBy?:     "hn_score" | "stars" | "last_commit_at" | "collected_at"
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
  const like = `%${query.toLowerCase()}%`
  const sql  = `
    SELECT * FROM projects
    WHERE LOWER(repo_name) LIKE ?
       OR LOWER(hn_title)  LIKE ?
       OR LOWER(description) LIKE ?
    ORDER BY hn_score DESC
    LIMIT ?
  `
  const rows = db.prepare(sql).all(like, like, like, Math.min(limit, 100)) as Record<string, unknown>[]
  return rows.map(rowToProject)
}

export function getProject(db: Database, repoName: string): Project | null {
  const row = db.prepare("SELECT * FROM projects WHERE repo_name = ? COLLATE NOCASE").get(repoName) as Record<string, unknown> | null
  return row ? rowToProject(row) : null
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
