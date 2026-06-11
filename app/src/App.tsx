import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { listProjects, getStats } from "./lib/api"
import type { LangCount, Project, SortField, SyncStatus } from "./lib/types"
import { Header } from "./components/Header"
import { SearchBar } from "./components/SearchBar"
import { FilterChips } from "./components/FilterChips"
import { ProjectList } from "./components/ProjectList"
import { Footer } from "./components/Footer"

export default function App() {
  const [projects, setProjects]         = useState<Project[]>([])
  const [query, setQuery]               = useState("")
  const [filter, setFilter]             = useState("all")
  const [sort, setSort]                 = useState<SortField>("hn_created_at")
  const [languages, setLanguages]       = useState<LangCount[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncStatus, setSyncStatus]     = useState<SyncStatus>("syncing")
  const [reloadToken, setReloadToken]   = useState(0)

  const loadStats = () => {
    getStats()
      .then((s) => {
        setLanguages(s.by_language)
        setLastSyncedAt(s.collected_at_range?.last ?? null)
      })
      .catch(console.error)
  }

  useEffect(() => {
    listProjects({ query, filter, sort_by: sort, limit: 100 })
      .then(setProjects)
      .catch(console.error)
  }, [query, filter, sort, reloadToken])

  useEffect(() => {
    loadStats()
    let unlistenFn: (() => void) | undefined
    listen<SyncStatus>("db-synced", (event) => {
      setSyncStatus(event.payload)
      if (event.payload === "updated") {
        setReloadToken((n) => n + 1)
        loadStats()
      }
    }).then((fn) => { unlistenFn = fn })

    return () => { unlistenFn?.() }
  }, [])

  return (
    <div className="popup">
      <Header />
      <SearchBar value={query} onChange={setQuery} sort={sort} onSortChange={setSort} />
      <FilterChips languages={languages} filter={filter} onChange={setFilter} />
      <ProjectList projects={projects} />
      <Footer lastSyncedAt={lastSyncedAt} syncStatus={syncStatus} />
    </div>
  )
}
