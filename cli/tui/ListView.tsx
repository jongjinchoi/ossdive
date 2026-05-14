import React, { useEffect, useState } from "react"
import { Box, Text, useApp, useInput, useStdout } from "ink"
import type { Project } from "../../src/types.ts"
import { openUrl } from "../browser.ts"
import { theme } from "./theme.ts"

interface Props {
  projects: Project[]
}

// Column widths
const COL_STARS    = 7
const COL_SCORE    = 4
const COL_LANG     = 12
const COL_REPO     = 26
const CHROME_LINES = 6  // header + footer + borders

function truncate(s: string | null, n: number): string {
  if (!s) return "—"
  return s.length <= n ? s : s.slice(0, n - 1) + "…"
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length)
}

function rpad(s: string, n: number): string {
  return s.padStart(n)
}

interface RowProps {
  project:    Project
  isSelected: boolean
  descWidth:  number
}

function ProjectRow({ project: p, isSelected, descWidth }: RowProps) {
  const stars = rpad(String(p.stars), COL_STARS)
  const score = rpad(String(p.hn_score), COL_SCORE)
  const lang  = pad(p.language ?? "—", COL_LANG)
  const repo  = pad(p.repo_name, COL_REPO)
  const desc  = truncate(p.description, Math.max(descWidth, 10))

  const cursor = isSelected
    ? <Text color={theme.primary}>▸ </Text>
    : <Text>  </Text>

  return (
    <Text wrap="truncate-end" backgroundColor={isSelected ? "#1a1a2e" : undefined}>
      {cursor}
      <Text color={theme.warn}>★</Text>
      <Text color={isSelected ? theme.primary : theme.text}>{stars}  </Text>
      <Text color={theme.muted}>HN:</Text>
      <Text color={isSelected ? theme.primary : theme.text}>{score}  </Text>
      <Text color={theme.accent}>{lang}  </Text>
      <Text color={isSelected ? theme.primary : theme.text} bold={isSelected}>{repo}  </Text>
      <Text color={theme.muted}>{desc}</Text>
    </Text>
  )
}

function Header() {
  return (
    <Text color={theme.muted}>
      {"  "}
      {pad("★ stars", COL_STARS + 1)}
      {"  "}
      {pad("HN", COL_SCORE + 4)}
      {"  "}
      {pad("Language", COL_LANG)}
      {"  "}
      {pad("Repo", COL_REPO)}
      {"  Description"}
    </Text>
  )
}

export function ListView({ projects }: Props) {
  const { exit }   = useApp()
  const { stdout } = useStdout()

  const [sel, setSel]         = useState(0)
  const [offset, setOffset]   = useState(0)
  const [view, setView]       = useState<"github" | "hn">("github")
  const [termRows, setTermRows] = useState(stdout.rows ?? 40)

  useEffect(() => {
    const onResize = () => setTermRows(stdout.rows ?? 40)
    stdout.on("resize", onResize)
    return () => { stdout.off("resize", onResize) }
  }, [stdout])

  const maxVisible = Math.max(4, termRows - CHROME_LINES)
  const visible    = Math.min(maxVisible, projects.length)
  const descWidth  = Math.max(30, (stdout.columns ?? 120) - COL_STARS - COL_SCORE - COL_LANG - COL_REPO - 20)

  // Keep cursor in viewport
  useEffect(() => {
    if (sel < offset)             setOffset(sel)
    else if (sel >= offset + visible) setOffset(sel - visible + 1)
  }, [sel, offset, visible])

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSel(s => Math.max(0, s - 1))
    } else if (key.downArrow || input === "j") {
      setSel(s => Math.min(projects.length - 1, s + 1))
    } else if (key.tab) {
      setView(v => v === "github" ? "hn" : "github")
    } else if (key.return) {
      const p = projects[sel]
      if (p) openUrl(view === "github" ? p.github_url : p.hn_url)
    } else if (input === "q" || key.escape) {
      exit()
    }
  })

  const visibleProjects = projects.slice(offset, offset + visible)
  const hasLess = offset > 0
  const hasMore = offset + visible < projects.length

  const viewLabel = view === "github" ? "GitHub" : "HN"

  return (
    <Box flexDirection="column">
      {/* Header bar */}
      <Box marginBottom={1}>
        <Text color={theme.primary} bold>ossdive  </Text>
        <Text color={theme.muted}>{projects.length} projects  </Text>
        <Text color={theme.accent}>Tab</Text>
        <Text color={theme.muted}> → open {viewLabel}  </Text>
        <Text color={theme.accent}>Enter</Text>
        <Text color={theme.muted}> → open link  </Text>
        <Text color={theme.accent}>q</Text>
        <Text color={theme.muted}> → quit</Text>
      </Box>

      <Header />

      {/* Scroll indicators + rows */}
      {hasLess && (
        <Text color={theme.muted}>  ↑ {offset} more</Text>
      )}

      <Box flexDirection="column">
        {visibleProjects.map((p, i) => (
          <ProjectRow
            key={p.repo_name}
            project={p}
            isSelected={offset + i === sel}
            descWidth={descWidth}
          />
        ))}
      </Box>

      {hasMore && (
        <Text color={theme.muted}>  ↓ {projects.length - offset - visible} more</Text>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {sel + 1}/{projects.length}  ·  {viewLabel} mode
        </Text>
      </Box>
    </Box>
  )
}
