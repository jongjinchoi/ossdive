import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { listProjects, getStats } from "./lib/api"
import type { Project, SyncStatus } from "./lib/types"
import { Header } from "./components/Header"
import { SearchBar } from "./components/SearchBar"
import { FilterChips } from "./components/FilterChips"
import { ProjectList } from "./components/ProjectList"
import { Footer } from "./components/Footer"

export default function App() {
  const [projects, setProjects]         = useState<Project[]>([])
  const [query, setQuery]               = useState("")
  const [filter, setFilter]             = useState("all")
  const [sort, setSort]                 = useState("hn_created_at")
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncStatus, setSyncStatus]     = useState<SyncStatus>("syncing")

  const loadData = () => {
    listProjects({}).then(setProjects).catch(console.error)
    getStats()
      .then((s) => setLastSyncedAt(s.collected_at_range?.last ?? null))
      .catch(console.error)
  }

  useEffect(() => {
    loadData()

    let unlistenFn: (() => void) | undefined
    listen<SyncStatus>("db-synced", (event) => {
      setSyncStatus(event.payload)
      if (event.payload === "updated") {
        loadData()
      }
    }).then((fn) => { unlistenFn = fn })

    return () => { unlistenFn?.() }
  }, [])

  return (
    <div className="popup">
      <Header />
      <SearchBar value={query} onChange={setQuery} sort={sort} onSortChange={setSort} />
      <FilterChips projects={projects} filter={filter} onChange={setFilter} />
      <ProjectList projects={projects} query={query} filter={filter} sort={sort} />
      <Footer lastSyncedAt={lastSyncedAt} syncStatus={syncStatus} />
    </div>
  )
}
