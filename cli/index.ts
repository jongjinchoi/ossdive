#!/usr/bin/env node
import { Command, Option } from "commander"
import { syncDb } from "./sync.ts"
import { openDB } from "../src/db/schema.ts"
import { listProjects, searchProjects, getProject, getStats, getTrending, findSimilar, getHot } from "../src/db/queries.ts"
import type { ListProjectsOpts } from "../src/db/queries.ts"
import { openBookmarksDB, addBookmark, removeBookmark, listBookmarks } from "../src/db/bookmarks.ts"
import { formatProjectList, formatProjectDetail, formatCompare, formatStats } from "../src/format.ts"
import type { Project } from "../src/types.ts"

declare const PKG_VERSION: string
const VERSION = typeof PKG_VERSION !== "undefined" ? PKG_VERSION : "0.0.0-dev"

const int = (v: string): number => Number.parseInt(v, 10)

function printPlainList(projects: Project[]): void {
  console.log(formatProjectList(projects))
}

function printDetail(p: Project): void {
  console.log(formatProjectDetail(p))
}

function printStats(stats: ReturnType<typeof getStats>): void {
  console.log(formatStats(stats))
}

function printCompare(projects: Project[]): void {
  console.log(formatCompare(projects))
}

function printSyncStatus(status: string): void {
  const labels: Record<string, string> = {
    updated: "↓ updated",
    fresh:   "✓ up to date",
    cached:  "✓ cached",
    offline: "⚠ offline (using cached DB)",
    missing: "✗ could not download DB",
  }
  process.stderr.write(`[sync] ${labels[status] ?? status}\n`)
}

async function renderList(projects: Project[], tui: boolean): Promise<void> {
  if (!tui || !process.stdout.isTTY) {
    printPlainList(projects)
    return
  }
  const { render }   = await import("ink")
  const React        = (await import("react")).default
  const { ListView } = await import("./tui/ListView.tsx")
  const instance = render(React.createElement(ListView, { projects }), {})
  await instance.waitUntilExit()
  process.exit(0)
}

// ── Program ───────────────────────────────────────────────────────────────────

const program = new Command()
  .name("ossdive")
  .description("HN OSS curation CLI — browse open-source projects from Hacker News")
  .version(VERSION)

// list (default)
program
  .command("list", { isDefault: true })
  .description("Browse curated projects in interactive TUI (default command)")
  .option("-l, --lang <lang>",    "Filter by language, e.g. rust, python")
  .option("-s, --min-stars <n>",  "Minimum GitHub stars",    int)
  .option("-c, --min-score <n>",  "Minimum HN score",        int)
  .option("--since <range>",      '"7d" / "30d" / "1y" / ISO date')
  .option("--show-hn",            "Show HN posts only")
  .addOption(new Option("--sort <field>", "Sort field").choices(["hn_score", "stars", "last_commit_at", "collected_at", "hn_created_at"]).default("hn_score"))
  .option("-n, --limit <n>",      "Max results (default: 50)", int, 50)
  .option("--no-tui",             "Plain text output (always on when not a TTY)")
  .action(async (opts) => {
    const { path, status } = await syncDb()

    if (status === "missing") {
      console.error("Error: could not download ossdive.db. Check your internet connection.")
      process.exit(1)
    }

    printSyncStatus(status)

    const queryOpts: ListProjectsOpts = {
      lang:      opts.lang,
      minStars:  opts.minStars,
      minScore:  opts.minScore,
      since:     opts.since,
      isShowHn:  opts.showHn || undefined,
      sortBy:    opts.sort as ListProjectsOpts["sortBy"],
      limit:     opts.limit,
    }

    const db       = openDB(path)
    const projects = listProjects(db, queryOpts)
    await renderList(projects, opts.tui !== false)
  })

// search
program
  .command("search <query>")
  .description("Keyword search across repo name, HN title, and description")
  .option("-n, --limit <n>", "Max results (default: 20)", int, 20)
  .action(async (query, opts) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)

    const db       = openDB(path)
    const projects = searchProjects(db, query, opts.limit as number)
    printPlainList(projects)
  })

// trending
program
  .command("trending")
  .description("Show projects trending on HN in the given time window")
  .option("--since <range>", '"7d" / "30d" / "1y" / ISO date (default: 7d)', "7d")
  .option("-n, --limit <n>", "Max results (default: 50)", int, 50)
  .option("--no-tui",        "Plain text output")
  .action(async (opts) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)
    const db       = openDB(path)
    const projects = getTrending(db, { since: opts.since, limit: opts.limit as number })
    await renderList(projects, opts.tui !== false)
  })

// compare
program
  .command("compare <repos...>")
  .description('Side-by-side comparison of 2–4 repos in "owner/repo" format')
  .action(async (repos: string[]) => {
    if (repos.length < 2) {
      console.error("Error: provide at least 2 repos to compare.")
      process.exit(1)
    }
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)
    const db       = openDB(path)
    const projects = repos.map(r => getProject(db, r))
    const missing  = repos.filter((_, i) => !projects[i])
    if (missing.length) {
      console.error(`Error: not found: ${missing.join(", ")}`)
      process.exit(1)
    }
    printCompare(projects as import("../src/types.ts").Project[])
  })

// similar
program
  .command("similar <repo>")
  .description('Find projects similar to the given repo ("owner/repo" format)')
  .option("-n, --limit <n>", "Max results (default: 10)", int, 10)
  .action(async (repo: string, opts) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)
    const db       = openDB(path)
    const projects = findSimilar(db, repo, opts.limit as number)
    if (projects.length === 0) {
      console.log(`No similar projects found for "${repo}".`)
      return
    }
    printPlainList(projects)
  })

// get
program
  .command("get <repo>")
  .description('Show details for a specific repo in "owner/repo" format')
  .action(async (repo: string) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)

    const db      = openDB(path)
    const project = getProject(db, repo)
    if (!project) {
      console.error(`Project "${repo}" not found.`)
      process.exit(1)
    }
    printDetail(project)
  })

// stats
program
  .command("stats")
  .description("Show collection overview (total, languages, top stars)")
  .action(async () => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)

    const db    = openDB(path)
    const stats = getStats(db)
    printStats(stats)
  })

// update
program
  .command("update")
  .description("Force sync the local DB from GitHub Releases now")
  .action(async () => {
    process.stderr.write("Syncing ossdive.db from GitHub Releases…\n")
    const { status, path } = await syncDb({ force: true })
    printSyncStatus(status)
    console.log(path)
  })

// hot
program
  .command("hot")
  .description("Show projects with rapidly increasing HN engagement vs N days ago")
  .option("--since <range>", '"3d" / "7d" / "30d" / ISO date (default: 3d)', "3d")
  .option("-n, --limit <n>", "Max results (default: 50)", int, 50)
  .option("--no-tui",        "Plain text output")
  .action(async (opts) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)
    const db       = openDB(path)
    const projects = getHot(db, { since: opts.since, limit: opts.limit as number })
    if (projects.length === 0) {
      console.log("No hot projects found. Snapshots need at least 2 days to compute velocity.")
      return
    }
    await renderList(projects, opts.tui !== false)
  })

// bookmark
const bookmark = program
  .command("bookmark")
  .description("Save and manage bookmarked projects")

bookmark
  .command("add <repo>")
  .description('Bookmark a project in "owner/repo" format')
  .action(async (repo: string) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    const db      = openDB(path)
    const project = getProject(db, repo)
    if (!project) {
      console.error(`Project "${repo}" not found in ossdive DB.`)
      process.exit(1)
    }
    const bdb = openBookmarksDB()
    addBookmark(bdb, project.repo_name)
    console.log(`Bookmarked: ${project.repo_name}`)
  })

bookmark
  .command("remove <repo>")
  .description('Remove a bookmarked project')
  .action(async (repo: string) => {
    const bdb     = openBookmarksDB()
    const removed = removeBookmark(bdb, repo)
    if (removed) console.log(`Removed bookmark: ${repo}`)
    else         console.error(`Bookmark not found: ${repo}`)
  })

bookmark
  .command("list")
  .description("List all bookmarked projects")
  .option("--no-tui", "Plain text output")
  .action(async (opts) => {
    const { path, status } = await syncDb()
    if (status === "missing") {
      console.error("Error: could not download ossdive.db.")
      process.exit(1)
    }
    printSyncStatus(status)
    const db   = openDB(path)
    const bdb  = openBookmarksDB()
    const { projects, archived } = listBookmarks(bdb, db)

    if (projects.length === 0 && archived.length === 0) {
      console.log("No bookmarks saved. Use `ossdive bookmark add <repo>` to add one.")
      return
    }

    if (projects.length > 0) {
      if (!opts.tui || !process.stdout.isTTY) {
        printPlainList(projects)
      } else {
        const { render }              = await import("ink")
        const React                   = (await import("react")).default
        const { BookmarkListView }    = await import("./tui/BookmarkListView.tsx")
        const { removeBookmark: rmBk } = await import("../src/db/bookmarks.ts")
        const instance = render(
          React.createElement(BookmarkListView, {
            projects,
            archived,
            onDelete: (repoName: string) => rmBk(bdb, repoName),
          }),
          {}
        )
        await instance.waitUntilExit()
        process.exit(0)
      }
    }

    if (archived.length > 0) {
      console.log(`\nArchived (no longer in DB): ${archived.join(", ")}`)
    }
  })

// mcp
program
  .command("mcp")
  .description("Start MCP server (stdio) for Claude Desktop / Claude Code")
  .action(async () => {
    await import("../mcp/index.ts")
  })

program.parseAsync()
