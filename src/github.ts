function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Accept":               "application/vnd.github+json",
    "User-Agent":           "ossdive",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  if (process.env["GITHUB_TOKEN"]) {
    headers["Authorization"] = `Bearer ${process.env["GITHUB_TOKEN"]}`
  }
  return headers
}

async function ghFetch(path: string): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, { headers: ghHeaders() })
  if (res.status === 404) throw new Error(`Not found: ${path}`)
  if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new Error("GitHub API rate limit exceeded. Set GITHUB_TOKEN env var to raise limit to 5,000/h.")
  }
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  return res
}

export async function fetchReadme(repoPath: string): Promise<string> {
  let res: Response
  try {
    res = await ghFetch(`/repos/${repoPath}/readme`)
  } catch (err) {
    if (String(err).includes("Not found")) return `No README found for ${repoPath}.`
    throw err
  }
  const data = (await res.json()) as { content: string; encoding: string }
  if (data.encoding !== "base64") throw new Error(`Unexpected README encoding: ${data.encoding}`)
  return Buffer.from(data.content, "base64").toString("utf-8")
}

export interface DirEntry {
  name: string
  path: string
  type: "file" | "dir" | "symlink" | "submodule"
  size: number
}

export async function fetchDir(repoPath: string, path: string): Promise<DirEntry[]> {
  const apiPath = path ? `/repos/${repoPath}/contents/${path}` : `/repos/${repoPath}/contents`
  const res = await ghFetch(apiPath)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`Expected directory listing at "${path || "/"}", got a file.`)
  return (data as Array<{ name: string; path: string; type: string; size: number }>).map(e => ({
    name: e.name,
    path: e.path,
    type: e.type as DirEntry["type"],
    size: e.size,
  }))
}

const FILE_SIZE_LIMIT = 100 * 1024  // 100 KB

export async function fetchFile(repoPath: string, path: string): Promise<{ content: string; size: number; truncated: boolean }> {
  const res = await ghFetch(`/repos/${repoPath}/contents/${path}`)
  const data = (await res.json()) as { type: string; content?: string; encoding?: string; size: number }
  if (data.type !== "file") throw new Error(`"${path}" is a directory. Use get_repo_files instead.`)
  if (!data.content || data.encoding !== "base64") {
    return { content: `(binary file, ${data.size} bytes — cannot display)`, size: data.size, truncated: false }
  }
  const decoded = Buffer.from(data.content, "base64").toString("utf-8")
  if (data.size > FILE_SIZE_LIMIT) {
    const preview = decoded.slice(0, FILE_SIZE_LIMIT)
    return { content: preview, size: data.size, truncated: true }
  }
  return { content: decoded, size: data.size, truncated: false }
}
