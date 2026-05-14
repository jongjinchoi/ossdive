import { formatRelative } from "../lib/format"

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
    </div>
  )
}
