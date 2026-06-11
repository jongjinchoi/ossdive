import type { Project } from "../../src/types.ts"
import { ProjectListView } from "./ProjectListView.tsx"

interface Props {
  projects: Project[]
}

export function ListView({ projects }: Props) {
  return (
    <ProjectListView
      projects={projects}
      title="ossdive"
      countLabel={`${projects.length} projects`}
      emptyMessage="No projects found."
    />
  )
}
