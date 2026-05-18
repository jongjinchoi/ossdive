import { mkdir, readFile, writeFile, access, rename } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const CONFIG_DIR      = join(homedir(), ".ossdive")
export const DB_PATH         = join(CONFIG_DIR, "ossdive.db")
export const META_PATH       = join(CONFIG_DIR, "sync-meta.json")
export const BOOKMARKS_PATH  = join(CONFIG_DIR, "bookmarks.db")

const LEGACY_DB_PATH   = join(homedir(), ".ossriff", "ossriff.db")
const LEGACY_META_PATH = join(homedir(), ".ossriff", "sync-meta.json")

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  // One-shot migration from ~/.ossriff (idempotent)
  if (await fileExists(LEGACY_DB_PATH) && !(await fileExists(DB_PATH))) {
    await rename(LEGACY_DB_PATH, DB_PATH)
  }
  if (await fileExists(LEGACY_META_PATH) && !(await fileExists(META_PATH))) {
    await rename(LEGACY_META_PATH, META_PATH)
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  if (!(await fileExists(path))) return null
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T
  } catch {
    return null
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8")
}
