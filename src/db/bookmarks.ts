import { Database } from "bun:sqlite"
import { BOOKMARKS_PATH } from "../utils/fs.ts"
import { getProject } from "./queries.ts"
import type { Project } from "../types.ts"

export function openBookmarksDB(): Database {
  const db = new Database(BOOKMARKS_PATH, { strict: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      repo_name     TEXT PRIMARY KEY,
      bookmarked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
  return db
}

export function addBookmark(bdb: Database, repoName: string): void {
  bdb.prepare("INSERT OR IGNORE INTO bookmarks (repo_name) VALUES (?)").run(repoName)
}

export function removeBookmark(bdb: Database, repoName: string): number {
  return bdb.prepare("DELETE FROM bookmarks WHERE repo_name = ? COLLATE NOCASE").run(repoName).changes
}

export function listBookmarkNames(bdb: Database): string[] {
  return (bdb.prepare("SELECT repo_name FROM bookmarks ORDER BY bookmarked_at DESC").all() as { repo_name: string }[])
    .map(r => r.repo_name)
}

export interface BookmarkListResult {
  projects:  Project[]
  archived:  string[]   // repo names no longer in main DB
}

export function listBookmarks(bdb: Database, mainDb: Database): BookmarkListResult {
  const names = listBookmarkNames(bdb)
  const projects: Project[] = []
  const archived: string[] = []

  for (const name of names) {
    const p = getProject(mainDb, name)
    if (p) projects.push(p)
    else    archived.push(name)
  }

  return { projects, archived }
}
