import type { Project } from "./types.ts"
import type { Stats } from "./db/queries.ts"

export function truncateText(s: string | null, n: number): string {
  if (!s) return "—"
  return s.length <= n ? s : s.slice(0, n - 1) + "…"
}

interface ListFormatOpts {
  includeHnUrl?: boolean
  total?: number
}

export function formatProjectList(projects: Project[], opts: ListFormatOpts = {}): string {
  if (projects.length === 0) return "No projects found."

  const lines: string[] = []
  for (const p of projects) {
    const lang = p.language ?? "—"
    lines.push(`★${String(p.stars).padStart(7)}  HN:${String(p.hn_score).padStart(4)}  [${lang}]  ${p.repo_name}`)
    lines.push(`  ${truncateText(p.description, 80)}`)
    if (opts.includeHnUrl) {
      lines.push(`  GitHub: ${p.github_url}  |  HN: ${p.hn_url}`)
    } else {
      lines.push(`  ${p.github_url}`)
    }
    lines.push("")
  }

  lines.push(opts.total !== undefined
    ? `Found ${opts.total} / showing ${projects.length}`
    : `Showing ${projects.length}`)
  return lines.join("\n")
}

export function formatProjectDetail(p: Project, opts: { includeCollectedAt?: boolean } = {}): string {
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
  ]

  if (opts.includeCollectedAt) {
    lines.push(`Collected   : ${p.collected_at ?? "—"}`)
  }

  lines.push(
    ``,
    `GitHub : ${p.github_url}`,
    `HN     : ${p.hn_url}`,
  )

  return lines.join("\n")
}

export function formatCompare(projects: Project[]): string {
  if (projects.length === 0) return "No projects to compare."

  const col = 22
  const lines = [
    "  " + " ".repeat(col) + projects.map(p => p.repo_name.padEnd(20)).join("  "),
    "  " + "─".repeat(col + projects.length * 22),
  ]

  function row(label: string, vals: string[]): void {
    lines.push("  " + label.padEnd(col) + vals.map(v => v.padEnd(20)).join("  "))
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

export function formatStats(stats: Stats, opts: { heading?: string } = {}): string {
  const lines = [
    ...(opts.heading ? [opts.heading, ``] : []),
    `Total projects : ${stats.total.toLocaleString()}`,
    `Show HN        : ${stats.showHnCount.toLocaleString()}`,
    ``,
    opts.heading ? `## Top Languages` : `Top Languages:`,
  ]

  for (const { lang, count } of stats.byLanguage) {
    lines.push(`  ${lang.padEnd(20)} ${count}`)
  }

  lines.push(``, opts.heading ? `## Top 5 by Stars` : `Top 5 by Stars:`)
  for (const { repo_name, stars } of stats.top5Stars) {
    lines.push(`  ★${String(stars).padStart(7)}  ${repo_name}`)
  }

  if (stats.collectedAtRange) {
    if (opts.heading) {
      lines.push(``, `## Collection Range`)
      lines.push(`  First : ${stats.collectedAtRange.first}`)
      lines.push(`  Last  : ${stats.collectedAtRange.last}`)
    } else {
      lines.push(``, `Collection range: ${stats.collectedAtRange.first} → ${stats.collectedAtRange.last}`)
    }
  }

  return lines.join("\n")
}
