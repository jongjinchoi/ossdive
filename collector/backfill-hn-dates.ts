import { Database } from "bun:sqlite"
import { openDB } from "../src/db/schema.ts"
import { DB_PATH as DEFAULT_DB_PATH, ensureConfigDir } from "../src/utils/fs.ts"

const DB_PATH = process.env["OSSRIFF_DB"] ?? DEFAULT_DB_PATH

function extractObjectId(hnUrl: string): string | null {
  const m = hnUrl.match(/[?&]id=(\d+)/)
  return m ? m[1]! : null
}

async function fetchCreatedAt(objectId: string): Promise<string | null> {
  const url = `https://hn.algolia.com/api/v1/items/${objectId}`
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) return null
  const data = (await res.json()) as { created_at?: string }
  return data.created_at ?? null
}

async function main() {
  await ensureConfigDir()
  const db = openDB(DB_PATH)

  const rows = db.prepare(
    "SELECT id, hn_url FROM projects WHERE hn_created_at IS NULL AND hn_url IS NOT NULL ORDER BY id"
  ).all() as { id: number; hn_url: string }[]

  console.log(`Backfilling hn_created_at for ${rows.length} rows…`)

  const update = db.prepare("UPDATE projects SET hn_created_at = ? WHERE id = ?")

  let done = 0
  let failed = 0

  for (const row of rows) {
    const objectId = extractObjectId(row.hn_url)
    if (!objectId) { failed++; continue }

    try {
      const createdAt = await fetchCreatedAt(objectId)
      if (createdAt) {
        update.run(createdAt, row.id)
        done++
      } else {
        failed++
      }
    } catch {
      failed++
    }

    if ((done + failed) % 100 === 0) {
      console.log(`  ${done + failed}/${rows.length} (${done} ok, ${failed} failed)`)
    }

    await Bun.sleep(50)
  }

  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.close()

  console.log(`\nDone: ${done} updated, ${failed} failed / ${rows.length} total`)
}

await main()
