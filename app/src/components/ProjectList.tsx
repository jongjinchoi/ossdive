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

function sortProjects(projects: Project[], sort: string): Project[] {
  return [...projects].sort((a, b) => {
    switch (sort) {
      case "stars":
        return b.stars - a.stars
      case "hn_score":
        return b.hn_score - a.hn_score
      case "last_commit_at": {
        const da = a.last_commit_at ?? ""
        const db = b.last_commit_at ?? ""
        return db.localeCompare(da)
      }
      case "hn_created_at":
      default: {
        const da = a.hn_created_at ?? ""
        const db = b.hn_created_at ?? ""
        return db.localeCompare(da)
      }
    }
  })
}

interface ProjectListProps {
  projects: Project[]
  query: string
  filter: string
  sort: string
}

export function ProjectList({ projects, query, filter, sort }: ProjectListProps) {
  const sorted = sortProjects(projects, sort)
  const visible = sorted.filter((p) => matches(p, query, filter))

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
