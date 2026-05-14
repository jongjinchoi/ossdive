import { useEffect, useState } from "react"
import { listProjects, getStats } from "./lib/api"
import type { Project } from "./lib/types"
import { Header } from "./components/Header"
import { SearchBar } from "./components/SearchBar"
import { FilterChips } from "./components/FilterChips"
import { ProjectList } from "./components/ProjectList"
import { Footer } from "./components/Footer"

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)

  useEffect(() => {
    listProjects({ limit: 100 }).then(setProjects).catch(console.error)
    getStats()
      .then((s) => setLastSyncedAt(s.collected_at_range?.last ?? null))
      .catch(console.error)
  }, [])

  return (
    <div className="popup">
      <Header count={projects.length} />
      <SearchBar value={query} onChange={setQuery} />
      <FilterChips projects={projects} filter={filter} onChange={setFilter} />
      <ProjectList projects={projects} query={query} filter={filter} />
      <Footer lastSyncedAt={lastSyncedAt} />
    </div>
  )
}
