import { formatRelative } from "../lib/format"
import { quitApp } from "../lib/api"

interface FooterProps {
  lastSyncedAt: string | null
}

export function Footer({ lastSyncedAt }: FooterProps) {
  const label = lastSyncedAt ? `Synced ${formatRelative(lastSyncedAt)} ago` : "Never synced"

  return (
    <div className="footer">
      <div className="sync">
        <div className="sync-dot" />
        <span>{label}</span>
      </div>
      <span className="spacer" />
      <button className="fcta" onClick={() => quitApp()}>Quit</button>
    </div>
  )
}
