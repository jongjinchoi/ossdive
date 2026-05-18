#!/usr/bin/env node
import { Command } from "commander"
import { syncDb } from "./sync.ts"
import { openDB } from "../src/db/schema.ts"
import { listProjects, searchProjects, getProject, getStats, getTrending, findSimilar } from "../src/db/queries.ts"
import type { ListProjectsOpts } from "../src/db/queries.ts"
import type { Project } from "../src/types.ts"

declare const PKG_VERSION: string
const VERSION = typeof PKG_VERSION !== "undefined" ? PKG_VERSION : "0.0.0-dev"

const int = (v: string): number => Number.parseInt(v, 10)

// ── Plain-text formatters (for non-TTY / --no-tui) ───────────────────────────

function truncate(s: string | null, n: number): string {
  if (!s) return "—"
  return s.length <= n ? s : s.slice(0, n - 1) + "…"
}

function printPlainList(projects: Project[]): void {
  if (projects.length === 0) {
    console.log("No projects found.")
    return
  }
  for (const p of projects) {
    const lang = p.language ?? "—"
    console.log(`★${String(p.stars).padStart(7)}  HN:${String(p.hn_score).padStart(4)}  [${lang}]  ${p.repo_name}`)
    console.log(`  ${truncate(p.description, 80)}`)
    console.log(`  ${p.github_url}`)
    console.log()
  }
  console.log(`Showing ${projects.length}`)
}

function printDetail(p: Project): void {
  const lines = [
    `# ${p.repo_name}`,
    ``,
    `Description : ${p.description ?? "—"}`,
    `Language    : ${p.language ?? "—"}`,
    `License     : ${p.license ?? "—"}`,
    `Stars       : ${p.stars.toLocaleString()}`,
    `Forks       : ${p.forks.toLocaleString()}`,
    `Open Issues : ${p.open_issues.toLocaleString()}`,
    `Last Commit : ${p.last_commit_at ?? "—"}`,
    ``,
    `HN Title    : ${p.hn_title}`,
    `HN Score    : ${p.hn_score}`,
    `HN Comments : ${p.hn_comments}`,
    `HN Posted   : ${p.hn_created_at ?? "—"}`,
    `Show HN     : ${p.is_show_hn ? "Yes" : "No"}`,
    ``,
    `GitHub : ${p.github_url}`,
    `HN     : ${p.hn_url}`,
  ]
  console.log(lines.join("\n"))
}

function printStats(stats: ReturnType<typeof getStats>): void {
  console.log(`Total projects : ${stats.total.toLocaleString()}`)
  console.log(`Show HN        : ${stats.showHnCount.toLocaleString()}`)
  console.log()
  console.log("Top Languages:")
  for (const { lang, count } of stats.byLanguage) {
    console.log(`  ${lang.padEnd(20)} ${count}`)
  }
  console.log()
  console.log("Top 5 by Stars:")
  for (const { repo_name, stars } of stats.top5Stars) {
    console.log(`  ★${String(stars).padStart(7)}  ${repo_name}`)
  }
  if (stats.collectedAtRange) {
    console.log()
    console.log(`Collection range: ${stats.collectedAtRange.first} → ${stats.collectedAtRange.last}`)
  }
}

function printCompare(projects: Project[]): void {
  if (projects.length === 0) { console.log("No projects to compare."); return }

  const COL = 22
  const header = "  " + " ".repeat(COL) + projects.map(p => p.repo_name.padEnd(20)).join("  ")
  console.log(header)
  console.log("  " + "─".repeat(COL + projects.length * 22))

  function row(label: string, vals: string[]): void {
    console.log("  " + label.padEnd(COL) + vals.map(v => v.padEnd(20)).join("  "))
  }

  row("Stars",        projects.map(p => `★ ${p.stars.toLocaleString()}`))
  row("Forks",        projects.map(p => p.forks.toLocaleString()))
  row("Open Issues",  projects.map(p => p.open_issues.toLocaleString()))
  row("HN Score",     projects.map(p => String(p.hn_score)))
  row("HN Comments",  projects.map(p => String(p.hn_comments)))
  row("Last Commit",  projects.map(p => p.last_commit_at?.slice(0, 10) ?? "—"))
  row("Language",     projects.map(p => p.language ?? "—"))
  row("License",      projects.map(p => p.license ?? "—"))
  row("Show HN",      projects.map(p => p.is_show_hn ? "Yes" : "No"))
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
  .option("--sort <field>",       "hn_score | stars | last_commit_at | collected_at | hn_created_at", "hn_score")
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

// mcp
program
  .command("mcp")
  .description("Start MCP server (stdio) for Claude Desktop / Claude Code")
  .action(async () => {
    await import("../mcp/index.ts")
  })

program.parseAsync()
