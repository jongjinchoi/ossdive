import { describe, expect, test } from "bun:test"
import { openDB, upsertProject } from "../src/db/schema.ts"
import { getStats, listProjects, parseSince } from "../src/db/queries.ts"
import type { Project } from "../src/types.ts"

function project(repoName: string, language: string | null, hnCreatedAt: string): Project {
  return {
    github_url: `https://github.com/${repoName}`,
    repo_name: repoName,
    description: `${repoName} description`,
    language,
    license: "MIT",
    stars: 100,
    forks: 10,
    open_issues: 1,
    last_commit_at: "2026-01-01T00:00:00Z",
    hn_title: `${repoName} on HN`,
    hn_score: 100,
    hn_comments: 20,
    hn_url: `https://news.ycombinator.com/item?id=${repoName.replace("/", "-")}`,
    is_show_hn: false,
    hn_created_at: hnCreatedAt,
  }
}

describe("db queries", () => {
  test("parseSince returns SQLite-compatible UTC timestamps", () => {
    expect(parseSince("2026-01-02T03:04:05Z")).toBe("2026-01-02 03:04:05")
  })

  test("listProjects since filter uses HN creation time", () => {
    const db = openDB(":memory:")
    try {
      upsertProject(db, project("old/repo", "Rust", "2025-12-31T23:59:59Z"))
      upsertProject(db, project("new/repo", "Rust", "2026-01-01T00:00:00Z"))

      const projects = listProjects(db, { since: "2026-01-01", sortBy: "hn_created_at", limit: 10 })
      expect(projects.map(p => p.repo_name)).toEqual(["new/repo"])
    } finally {
      db.close()
    }
  })

  test("getStats groups C and C++ like the Tauri app", () => {
    const db = openDB(":memory:")
    try {
      upsertProject(db, project("c/repo", "C", "2026-01-01T00:00:00Z"))
      upsertProject(db, project("cpp/repo", "C++", "2026-01-01T00:00:00Z"))
      upsertProject(db, project("rust/repo", "Rust", "2026-01-01T00:00:00Z"))

      const stats = getStats(db)
      expect(stats.byLanguage).toContainEqual({ lang: "C/C++", count: 2 })
    } finally {
      db.close()
    }
  })
})
