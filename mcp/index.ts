import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { join } from "node:path"
import { homedir } from "node:os"
import { existsSync } from "node:fs"
import { openDB } from "../src/db/schema.ts"
import { listProjects, searchProjects, getProject, getStats } from "../src/db/queries.ts"
import type { Project, } from "../src/types.ts"

function resolveDbPath(): string {
  if (process.env["OSSRIFF_DB"]) return process.env["OSSRIFF_DB"]
  const home = join(homedir(), ".ossriff", "ossriff.db")
  if (existsSync(home)) return home
  return "ossriff.db"
}

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
    `Show HN     : ${p.is_show_hn ? "Yes" : "No"}`,
    `Collected   : ${p.collected_at ?? "—"}`,
    ``,
    `GitHub : ${p.github_url}`,
    `HN     : ${p.hn_url}`,
  ]
  return lines.join("\n")
}

function formatStats(stats: ReturnType<typeof getStats>): string {
  const lines = [
    `# ossriff Stats`,
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
  { name: "ossriff", version: "0.1.0" },
  {
    instructions: `ossriff is an HN OSS project curator. Use these tools to explore curated open-source projects discovered on Hacker News.

- list_projects: Browse with filters (language, stars, HN score, date, Show HN)
- search_projects: Full-text search across repo names, HN titles, and descriptions
- get_project: Detailed info for a specific repo (format: "owner/repo")
- get_stats: Overview of the entire collection`,
  },
)

const db = openDB(resolveDbPath())

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
      sort_by:    z.enum(["hn_score", "stars", "last_commit_at", "collected_at"]).optional().describe('Sort field (default: "hn_score")'),
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
    description: "Get an overview of the ossriff collection: total count, language distribution, top starred repos, and collection date range.",
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

const transport = new StdioServerTransport()
await server.connect(transport)
