import { CONFIG_DIR, DB_PATH, META_PATH, ensureConfigDir, fileExists, readJson, writeJson } from "../src/utils/fs.ts"

const REPO = "jongjinchoi/ossdive"
const TAG  = "db-latest"
const TTL  = 60 * 60 * 1000  // 1h in ms

interface SyncMeta {
  assetId:   number
  updatedAt: string
  syncedAt:  number
}

interface GHAsset {
  id:                  number
  name:                string
  updated_at:          string
  browser_download_url: string
}

interface GHRelease {
  assets: GHAsset[]
}

export type SyncStatus = "fresh" | "cached" | "updated" | "offline" | "missing"

function apiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Accept": "application/vnd.github+json" }
  if (process.env["GITHUB_TOKEN"]) {
    headers["Authorization"] = `Bearer ${process.env["GITHUB_TOKEN"]}`
  }
  return headers
}

async function fetchRelease(): Promise<GHRelease> {
  const url = `https://api.github.com/repos/${REPO}/releases/tags/${TAG}`
  const res  = await fetch(url, { headers: apiHeaders(), signal: AbortSignal.timeout(8000) })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`)
  return res.json() as Promise<GHRelease>
}

async function downloadAsset(assetId: number, dest: string): Promise<void> {
  const url = `https://api.github.com/repos/${REPO}/releases/assets/${assetId}`
  const res  = await fetch(url, {
    headers: { ...apiHeaders(), "Accept": "application/octet-stream" },
    signal:  AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${res.statusText}`)
  const buf = await res.arrayBuffer()
  await Bun.write(dest, buf)
}

export async function syncDb({ force = false }: { force?: boolean } = {}): Promise<{
  status: SyncStatus
  path:   string
}> {
  // Dev override: OSSDIVE_DB env var bypasses sync entirely (same as MCP server pattern)
  if (process.env["OSSDIVE_DB"]) {
    return { status: "cached", path: process.env["OSSDIVE_DB"] }
  }

  await ensureConfigDir()
  const meta = await readJson<SyncMeta>(META_PATH)

  // TTL cache hit: skip network entirely
  if (!force && meta && Date.now() - meta.syncedAt < TTL && (await fileExists(DB_PATH))) {
    return { status: "cached", path: DB_PATH }
  }

  try {
    const release = await fetchRelease()
    const asset   = release.assets.find(a => a.name === "ossdive.db")
    if (!asset) throw new Error("ossdive.db asset not found in db-latest release")

    // Same version as cached: update syncedAt timestamp, skip download
    if (!force && meta?.updatedAt === asset.updated_at && (await fileExists(DB_PATH))) {
      await writeJson(META_PATH, { ...meta, syncedAt: Date.now() })
      return { status: "fresh", path: DB_PATH }
    }

    await downloadAsset(asset.id, DB_PATH)
    await writeJson(META_PATH, { assetId: asset.id, updatedAt: asset.updated_at, syncedAt: Date.now() })
    return { status: "updated", path: DB_PATH }
  } catch {
    // Network failure: fall back to local DB if it exists
    if (await fileExists(DB_PATH)) return { status: "offline", path: DB_PATH }
    return { status: "missing", path: DB_PATH }
  }
}

export { CONFIG_DIR, DB_PATH }
