import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { openDB } from "../src/db/schema.ts"
import { listProjects, searchProjects, getProject, getStats, getTrending, findSimilar, getHot } from "../src/db/queries.ts"
import { fetchReadme, fetchDir, fetchFile } from "../src/github.ts"
import { openBookmarksDB, addBookmark, removeBookmark, listBookmarks } from "../src/db/bookmarks.ts"
import { syncDb } from "../cli/sync.ts"
import { extractHnItemId, fetchHnThread } from "../src/hn.ts"
import type { Project } from "../src/types.ts"

// ── Formatters ────────────────────────────────────────────────────────────────

function truncate(s: string | null, n: number): string {
  if (!s) return "—"
  return s.length <= n ? s : s.slice(0, n - 1) + "…"
}

function formatList(projects: Project[], total?: number): string {
  if (projects.length === 0) return "No projects found."

  const lines: string[] = []
  for (const p of projects) {
    const lang = p.language ?? "—"
    const desc = truncate(p.description, 80)
    lines.push(`★${String(p.stars).padStart(6)}  HN:${String(p.hn_score).padStart(4)}  [${lang}]  ${p.repo_name}`)
    lines.push(`  ${desc}`)
    lines.push(`  GitHub: ${p.github_url}  |  HN: ${p.hn_url}`)
    lines.push("")
  }

  const footer = total !== undefined
    ? `Found ${total} / showing ${projects.length}`
    : `Showing ${projects.length}`
  lines.push(footer)
  return lines.join("\n")
}

function formatProject(p: Project): string {
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
    `Collected   : ${p.collected_at ?? "—"}`,
    ``,
    `GitHub : ${p.github_url}`,
    `HN     : ${p.hn_url}`,
  ]
  return lines.join("\n")
}

function formatCompare(projects: Project[]): string {
  if (projects.length === 0) return "No projects to compare."

  const COL = 20
  const lines: string[] = []
  const header = " ".repeat(COL) + projects.map(p => p.repo_name.padEnd(22)).join("")
  lines.push(header)
  lines.push("─".repeat(COL + projects.length * 22))

  function row(label: string, vals: string[]): void {
    lines.push(label.padEnd(COL) + vals.map(v => v.padEnd(22)).join(""))
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

  return lines.join("\n")
}

function formatStats(stats: ReturnType<typeof getStats>): string {
  const lines = [
    `# ossdive Stats`,
    ``,
    `Total projects : ${stats.total.toLocaleString()}`,
    `Show HN        : ${stats.showHnCount.toLocaleString()}`,
    ``,
    `## Top Languages`,
  ]

  for (const { lang, count } of stats.byLanguage) {
    lines.push(`  ${lang.padEnd(20)} ${count}`)
  }

  lines.push(``, `## Top 5 by Stars`)
  for (const { repo_name, stars } of stats.top5Stars) {
    lines.push(`  ★${String(stars).padStart(7)}  ${repo_name}`)
  }

  if (stats.collectedAtRange) {
    lines.push(``, `## Collection Range`)
    lines.push(`  First : ${stats.collectedAtRange.first}`)
    lines.push(`  Last  : ${stats.collectedAtRange.last}`)
  }

  return lines.join("\n")
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new McpServer(
  { name: "ossdive", version: "0.1.0" },
  {
    instructions: `ossdive is an HN OSS project curator. Use these tools to explore curated open-source projects discovered on Hacker News.

- list_projects: Browse with filters (language, stars, HN score, date, Show HN)
- search_projects: FTS5 full-text search across repo names, HN titles, and descriptions (relevance ranked)
- get_project: Detailed info for a specific repo (format: "owner/repo")
- get_stats: Overview of the entire collection
- get_trending: Projects recently trending on HN (by score + comments) within a time window
- get_hot: Projects with rapidly increasing HN engagement vs N days ago (velocity-based, needs 2+ days of snapshots)
- compare_projects: Side-by-side comparison of 2–4 repos
- find_similar: Repos similar to a given one (same language, similar size, keyword overlap)
- add_bookmark: Save a project to your personal bookmark list
- remove_bookmark: Remove a project from bookmarks
- list_bookmarks: List all bookmarked projects
- get_repo_readme: Fetch the README of any GitHub repo ("owner/repo")
- get_repo_files: List files/directories in a GitHub repo path (one level, shallow)
- get_repo_file: Read the source of a specific file in a GitHub repo
- get_hn_comments: Fetch the full HN comment thread for a project — use this to analyze community feedback (pain points, feature requests, form factor suggestions)`,
  },
)

const { path, status } = await syncDb()
if (status === "missing") {
  process.stderr.write("ossdive: database not found and network unavailable\n")
  process.exit(1)
}
const db  = openDB(path)
const bdb = openBookmarksDB()

server.registerTool(
  "list_projects",
  {
    description: "List curated OSS projects from Hacker News with optional filters and sorting.",
    inputSchema: {
      lang:       z.string().optional().describe('Filter by language, e.g. "rust", "python"'),
      min_stars:  z.number().int().min(0).optional().describe("Minimum GitHub star count"),
      min_score:  z.number().int().min(0).optional().describe("Minimum HN score"),
      since:      z.string().optional().describe('Date filter: "7d", "30d", "1y", or ISO date "2025-01-01"'),
      is_show_hn: z.boolean().optional().describe("Filter to Show HN posts only"),
      sort_by:    z.enum(["hn_score", "stars", "last_commit_at", "collected_at", "hn_created_at"]).optional().describe('Sort field (default: "hn_score")'),
      limit:      z.number().int().min(1).max(100).optional().describe("Max results (default: 20, max: 100)"),
    },
  },
  async ({ lang, min_stars, min_score, since, is_show_hn, sort_by, limit }) => {
    try {
      const projects = listProjects(db, {
        lang, minStars: min_stars, minScore: min_score,
        since, isShowHn: is_show_hn, sortBy: sort_by, limit,
      })
      return { content: [{ type: "text" as const, text: formatList(projects) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "search_projects",
  {
    description: "Search OSS projects by keyword across repo name, HN title, and description.",
    inputSchema: {
      query: z.string().min(1).describe("Search keyword"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
    },
  },
  async ({ query, limit }) => {
    try {
      const projects = searchProjects(db, query, limit)
      return { content: [{ type: "text" as const, text: formatList(projects) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_project",
  {
    description: 'Get full details for a specific GitHub repo. Use "owner/repo" format, e.g. "microsoft/VibeVoice".',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
    },
  },
  async ({ repo_name }) => {
    try {
      const project = getProject(db, repo_name)
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${repo_name}" not found.` }] }
      }
      return { content: [{ type: "text" as const, text: formatProject(project) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_stats",
  {
    description: "Get an overview of the ossdive collection: total count, language distribution, top starred repos, and collection date range.",
    inputSchema: {},
  },
  async () => {
    try {
      const stats = getStats(db)
      return { content: [{ type: "text" as const, text: formatStats(stats) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_trending",
  {
    description: "Show OSS projects recently trending on HN, ranked by score + comments activity.",
    inputSchema: {
      since: z.string().optional().describe('Time window: "7d", "30d", "1y", or ISO date (default: "7d")'),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
    },
  },
  async ({ since, limit }) => {
    try {
      const projects = getTrending(db, { since, limit })
      return { content: [{ type: "text" as const, text: formatList(projects) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "compare_projects",
  {
    description: 'Side-by-side comparison of 2–4 repos. Use "owner/repo" format for each.',
    inputSchema: {
      repos: z.array(z.string()).min(2).max(4).describe('List of repo names in "owner/repo" format'),
    },
  },
  async ({ repos }) => {
    try {
      const projects = repos.map(r => getProject(db, r))
      const missing  = repos.filter((_, i) => !projects[i])
      if (missing.length) {
        return { content: [{ type: "text" as const, text: `Not found: ${missing.join(", ")}` }], isError: true }
      }
      return { content: [{ type: "text" as const, text: formatCompare(projects as Project[]) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "find_similar",
  {
    description: 'Find projects similar to a given repo (same language, similar star count, keyword overlap). Use "owner/repo" format.',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
      limit: z.number().int().min(1).max(50).optional().describe("Max results (default: 10)"),
    },
  },
  async ({ repo_name, limit }) => {
    try {
      const projects = findSimilar(db, repo_name, limit)
      if (projects.length === 0) {
        return { content: [{ type: "text" as const, text: `No similar projects found for "${repo_name}".` }] }
      }
      return { content: [{ type: "text" as const, text: formatList(projects) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_hot",
  {
    description: "Show projects with rapidly increasing HN engagement (score + comments velocity). Requires at least 2 days of snapshot data after first collector run.",
    inputSchema: {
      since: z.string().optional().describe('Comparison window: "3d", "7d", "30d", or ISO date (default: "3d")'),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default: 20)"),
    },
  },
  async ({ since, limit }) => {
    try {
      const projects = getHot(db, { since, limit })
      if (projects.length === 0) {
        return { content: [{ type: "text" as const, text: "No hot projects found. Snapshot data needs at least 2 days to compute velocity." }] }
      }
      return { content: [{ type: "text" as const, text: formatList(projects) }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "add_bookmark",
  {
    description: 'Save a project to your personal bookmark list. Use "owner/repo" format.',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
    },
  },
  async ({ repo_name }) => {
    try {
      const project = getProject(db, repo_name)
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${repo_name}" not found in ossdive DB.` }], isError: true }
      }
      addBookmark(bdb, project.repo_name)
      return { content: [{ type: "text" as const, text: `Bookmarked: ${project.repo_name}` }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "remove_bookmark",
  {
    description: 'Remove a project from your bookmark list. Use "owner/repo" format.',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
    },
  },
  async ({ repo_name }) => {
    try {
      const removed = removeBookmark(bdb, repo_name)
      if (removed) return { content: [{ type: "text" as const, text: `Removed bookmark: ${repo_name}` }] }
      return { content: [{ type: "text" as const, text: `Bookmark not found: ${repo_name}` }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "list_bookmarks",
  {
    description: "List all bookmarked projects with their current stats from the ossdive DB.",
    inputSchema: {},
  },
  async () => {
    try {
      const { projects, archived } = listBookmarks(bdb, db)
      if (projects.length === 0 && archived.length === 0) {
        return { content: [{ type: "text" as const, text: "No bookmarks saved." }] }
      }
      const lines: string[] = []
      if (projects.length > 0) lines.push(formatList(projects))
      if (archived.length > 0) lines.push(`\nArchived (no longer in DB): ${archived.join(", ")}`)
      return { content: [{ type: "text" as const, text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_repo_readme",
  {
    description: 'Fetch the README of any GitHub repo. Use "owner/repo" format. Works without GITHUB_TOKEN (60 req/h); set GITHUB_TOKEN for 5,000/h.',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
    },
  },
  async ({ repo_name }) => {
    try {
      const text = await fetchReadme(repo_name)
      return { content: [{ type: "text" as const, text }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_repo_files",
  {
    description: 'List files and directories in a GitHub repo path (one level). Use "owner/repo" format. Leave path empty for the root.',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
      path:      z.string().optional().describe('Directory path within the repo (default: root)'),
    },
  },
  async ({ repo_name, path }) => {
    try {
      const entries = await fetchDir(repo_name, path ?? "")
      if (entries.length === 0) return { content: [{ type: "text" as const, text: "(empty directory)" }] }
      const lines = entries.map(e => {
        if (e.type === "dir") return `[dir]  ${e.name}/`
        const kb = e.size > 0 ? ` (${(e.size / 1024).toFixed(1)} KB)` : ""
        return `[file] ${e.name}${kb}`
      })
      return { content: [{ type: "text" as const, text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_repo_file",
  {
    description: 'Read the source of a specific file in a GitHub repo. Use "owner/repo" format. Files over 100 KB are truncated.',
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
      path:      z.string().describe('File path within the repo, e.g. "src/index.ts"'),
    },
  },
  async ({ repo_name, path }) => {
    try {
      const { content, size, truncated } = await fetchFile(repo_name, path)
      const footer = truncated
        ? `\n\n— truncated (file is ${(size / 1024).toFixed(0)} KB; showing first 100 KB) —`
        : ""
      return { content: [{ type: "text" as const, text: content + footer }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

server.registerTool(
  "get_hn_comments",
  {
    description: "Fetch the full Hacker News comment thread for a project. Use this to analyze community feedback — pain points, feature requests, form factor suggestions, and comparisons with other tools. Useful for understanding what users wish the project did differently.",
    inputSchema: {
      repo_name: z.string().describe('GitHub repo in "owner/repo" format'),
      limit:     z.number().int().min(1).max(500).optional().describe("Max comments to return (default: 200)"),
    },
  },
  async ({ repo_name, limit = 200 }) => {
    try {
      const project = getProject(db, repo_name)
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${repo_name}" not found.` }] }
      }

      if (project.hn_comments === 0) {
        return { content: [{ type: "text" as const, text: `No comments on the HN post for "${repo_name}".` }] }
      }

      const itemId = extractHnItemId(project.hn_url)
      if (!itemId) {
        return { content: [{ type: "text" as const, text: `Could not extract HN item ID from URL: ${project.hn_url}` }], isError: true }
      }

      const comments  = await fetchHnThread(itemId, limit)
      const truncated = comments.length >= limit && project.hn_comments > limit

      const indent = (depth: number) => "  ".repeat(depth)
      const lines: string[] = [
        `# ${project.hn_title}`,
        `HN Score: ${project.hn_score}  |  Comments: ${project.hn_comments}  |  ${project.hn_url}`,
        "",
      ]

      for (const c of comments) {
        lines.push(`${indent(c.depth)}[${c.author}]`)
        const textLines = c.text.split("\n")
        for (const tl of textLines) {
          lines.push(`${indent(c.depth)}${tl}`)
        }
        lines.push("")
      }

      if (truncated) {
        lines.push(`— showing ${comments.length} of ${project.hn_comments} comments (raise limit to see more) —`)
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] }
    } catch (err) {
      return { content: [{ type: "text" as const, text: `Error: ${String(err)}` }], isError: true }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
