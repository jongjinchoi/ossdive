import { openDB, getLastSince, setLastSince, upsertProject } from "../src/db/schema.ts"
import { DB_PATH as DEFAULT_DB_PATH, ensureConfigDir } from "../src/utils/fs.ts"
import type { HNPost, GitHubRepo, Project } from "../src/types.ts"

const HN_MIN_SCORE = 50
const GH_MIN_STARS = 100
const DB_PATH      = process.env["OSSDIVE_DB"] ?? DEFAULT_DB_PATH

interface HNResponse {
  hits:        HNPost[]
  page:        number
  nbPages:     number
  hitsPerPage: number
}

const WINDOW_SECS = 7 * 86400  // 7-day chunks to stay under Algolia's 1,000-result cap

async function fetchHNWindow(since: number, until: number): Promise<HNPost[]> {
  const all: HNPost[] = []
  let page = 0

  while (true) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points>=${HN_MIN_SCORE},created_at_i>${since},created_at_i<=${until}&hitsPerPage=200&page=${page}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HN API error: ${res.status} ${res.statusText}`)

    const data = (await res.json()) as HNResponse
    all.push(...data.hits)

    if (page >= data.nbPages - 1) break
    page++
  }

  return all
}

async function fetchHNPosts(since: number): Promise<HNPost[]> {
  const now = Math.floor(Date.now() / 1000)

  if (now - since <= WINDOW_SECS) {
    return fetchHNWindow(since, now)
  }

  // Backfill: split into 7-day windows so we never hit the 1,000-result cap
  const all: HNPost[] = []
  let windowStart = since
  while (windowStart < now) {
    const windowEnd = Math.min(windowStart + WINDOW_SECS, now)
    const label = `${new Date(windowStart * 1000).toISOString().slice(0, 10)} ~ ${new Date(windowEnd * 1000).toISOString().slice(0, 10)}`
    const posts = await fetchHNWindow(windowStart, windowEnd)
    console.log(`  [window] ${label}: ${posts.length} posts`)
    all.push(...posts)
    windowStart = windowEnd
  }

  return all
}

function extractRepoPath(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }

  if (parsed.host !== "github.com") return null

  const segments = parsed.pathname.split("/").filter(Boolean)
  if (segments.length < 2) return null

  const owner = segments[0]!
  const repo  = segments[1]!.replace(/\.git$/, "")

  if (segments.length > 2) {
    const sub = segments[2]!
    const blocked = ["blob", "tree", "issues", "pull", "releases", "actions", "wiki", "discussions", "commit", "compare"]
    if (blocked.includes(sub)) return null
  }

  return `${owner}/${repo}`
}

async function fetchGitHubRepo(repoPath: string): Promise<GitHubRepo | null> {
  const headers: Record<string, string> = {
    "Accept":                 "application/vnd.github+json",
    "User-Agent":             "ossdive-collector",
    "X-GitHub-Api-Version":   "2022-11-28",
  }
  if (process.env["GITHUB_TOKEN"]) {
    headers["Authorization"] = `Bearer ${process.env["GITHUB_TOKEN"]}`
  }

  const res = await fetch(`https://api.github.com/repos/${repoPath}`, { headers })

  if (res.status === 404 || res.status === 403) {
    console.warn(`  [skip] ${repoPath}: HTTP ${res.status}`)
    return null
  }
  if (res.status === 429 || res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = res.headers.get("x-ratelimit-reset")
    console.warn(`  [warn] GitHub rate limit hit. Resets at ${reset ? new Date(Number(reset) * 1000).toISOString() : "unknown"}`)
    return null
  }
  if (!res.ok) {
    console.warn(`  [skip] ${repoPath}: HTTP ${res.status}`)
    return null
  }

  return (await res.json()) as GitHubRepo
}

function toProject(post: HNPost, repo: GitHubRepo): Project {
  return {
    github_url:     repo.html_url,
    repo_name:      repo.full_name,
    description:    repo.description,
    language:       repo.language,
    license:        repo.license?.spdx_id ?? null,
    stars:          repo.stargazers_count,
    forks:          repo.forks_count,
    open_issues:    repo.open_issues_count,
    last_commit_at: repo.pushed_at,
    hn_title:       post.title,
    hn_score:       post.points,
    hn_comments:    post.num_comments,
    hn_url:         `https://news.ycombinator.com/item?id=${post.objectID}`,
    is_show_hn:     post._tags.includes("show_hn"),
    hn_created_at:  post.created_at,
  }
}

async function main() {
  await ensureConfigDir()
  const db    = openDB(DB_PATH)
  const since = getLastSince(db)
  const now   = Math.floor(Date.now() / 1000)

  const sinceLabel = new Date(since * 1000).toISOString()
  console.log(`Fetching HN posts since ${sinceLabel} (min score: ${HN_MIN_SCORE})…`)

  const posts = await fetchHNPosts(since)
  console.log(`  → ${posts.length} posts fetched`)

  const githubPosts = posts.filter(p => p.url?.includes("github.com"))
  console.log(`  → ${githubPosts.length} with github.com URL`)

  let stored = 0

  for (const post of githubPosts) {
    const repoPath = extractRepoPath(post.url)
    if (!repoPath) continue

    let repo: GitHubRepo | null
    try {
      repo = await fetchGitHubRepo(repoPath)
    } catch (err) {
      console.warn(`  [error] ${repoPath}: ${String(err)}`)
      continue
    }

    if (!repo) continue
    if (repo.stargazers_count < GH_MIN_STARS) continue

    upsertProject(db, toProject(post, repo))
    stored++

    await Bun.sleep(100)
  }

  // Checkpoint: next run starts from this moment
  setLastSince(db, now)

  console.log(`\nCollected: ${posts.length} HN posts → ${githubPosts.length} github repos → ${stored} stored`)

  // Flush WAL to main DB file before upload to GitHub Releases
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)")
  db.close()
}

await main()
