import type { Project } from "../../src/types.ts"
import { ProjectListView } from "./ProjectListView.tsx"

interface Props {
  projects:  Project[]
  archived?: string[]
  onDelete:  (repoName: string) => void
}

export function BookmarkListView({ projects, archived = [], onDelete }: Props) {
  return (
    <ProjectListView
      projects={projects}
      title="bookmarks"
      countLabel={`${projects.length} saved`}
      emptyMessage="No bookmarks saved."
      archived={archived}
      onDelete={onDelete}
    />
  )
}
