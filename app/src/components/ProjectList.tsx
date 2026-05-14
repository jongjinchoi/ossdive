import type { Project } from "../lib/types"
import { ProjectItem } from "./ProjectItem"

function langToKey(lang: string | null): string {
  if (!lang) return "unknown"
  return lang === "C" || lang === "C++" ? "c" : lang.toLowerCase()
}

function matches(p: Project, query: string, filter: string): boolean {
  const q = query.toLowerCase()
  const matchesQuery =
    !q ||
    p.repo_name.toLowerCase().includes(q) ||
    (p.description ?? "").toLowerCase().includes(q) ||
    (p.hn_title ?? "").toLowerCase().includes(q)

  const matchesFilter =
    filter === "all" || langToKey(p.language) === filter

  return matchesQuery && matchesFilter
}

interface ProjectListProps {
  projects: Project[]
  query: string
  filter: string
}

export function ProjectList({ projects, query, filter }: ProjectListProps) {
  const visible = projects.filter((p) => matches(p, query, filter))

  if (!visible.length) {
    return (
      <div className="list">
        <div className="empty">
          {projects.length === 0
            ? "Run ossriff collect to populate the database."
            : "No matching projects."}
        </div>
      </div>
    )
  }

  return (
    <div className="list">
      {visible.map((p) => (
        <ProjectItem key={p.id} project={p} />
      ))}
    </div>
  )
}
