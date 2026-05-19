import { formatRelative } from "../lib/format"
import { quitApp } from "../lib/api"
import type { SyncStatus } from "../lib/types"

interface FooterProps {
  lastSyncedAt: string | null
  syncStatus:   SyncStatus
}

function syncLabel(status: SyncStatus, lastSyncedAt: string | null): string {
  switch (status) {
    case "syncing":  return "Syncing…"
    case "offline":  return "Offline"
    case "missing":  return "No database"
    default:         return lastSyncedAt ? `Synced ${formatRelative(lastSyncedAt)} ago` : "Synced"
  }
}

function syncDotColor(status: SyncStatus): string {
  switch (status) {
    case "syncing":  return "var(--label-4)"
    case "offline":  return "#FF9F0A"
    case "missing":  return "#FF453A"
    default:         return "var(--green)"
  }
}

export function Footer({ lastSyncedAt, syncStatus }: FooterProps) {
  return (
    <div className="footer">
      <div className="sync">
        <div className="sync-dot" style={{ background: syncDotColor(syncStatus), boxShadow: "none" }} />
        <span>{syncLabel(syncStatus, lastSyncedAt)}</span>
      </div>
      <span className="spacer" />
      <button className="fcta" onClick={() => quitApp()}>Quit</button>
    </div>
  )
}
