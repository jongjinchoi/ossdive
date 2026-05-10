import { mkdir, readFile, writeFile, access } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const CONFIG_DIR = join(homedir(), ".ossriff")
export const DB_PATH    = join(CONFIG_DIR, "ossriff.db")
export const META_PATH  = join(CONFIG_DIR, "sync-meta.json")

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
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
