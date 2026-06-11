import type { Project } from "../lib/types"
import { ProjectItem } from "./ProjectItem"

interface ProjectListProps {
  projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
  if (!projects.length) {
    return (
      <div className="list">
        <div className="empty">No matching projects.</div>
      </div>
    )
  }

  return (
    <div className="list">
      {projects.map((p) => (
        <ProjectItem key={p.id} project={p} />
      ))}
    </div>
  )
}
