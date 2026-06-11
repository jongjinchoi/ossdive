import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { processPost, extractRepoPath } from "../collector/index.ts"
import { openDB } from "../src/db/schema.ts"
import { getProject } from "../src/db/queries.ts"
import type { HNPost, GitHubRepo } from "../src/types.ts"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function hnPost(url: string): HNPost {
  return {
    objectID: "123",
    title: "Show HN: Test Repo",
    url,
    points: 75,
    num_comments: 12,
    created_at: "2026-06-01T00:00:00.000Z",
    created_at_i: 1_780_000_000,
    author: "alice",
    _tags: ["story", "show_hn"],
  }
}

function githubRepo(stars: number): GitHubRepo {
  return {
    html_url: "https://github.com/acme/widgets",
    full_name: "acme/widgets",
    description: "Widget toolkit",
    language: "TypeScript",
    license: { spdx_id: "MIT" },
    stargazers_count: stars,
    forks_count: 7,
    open_issues_count: 3,
    pushed_at: "2026-06-02T00:00:00.000Z",
    topics: [],
  }
}

describe("collector", () => {
  test("extractRepoPath accepts repository URLs and rejects subresource URLs", () => {
    expect(extractRepoPath("https://github.com/acme/widgets")).toBe("acme/widgets")
    expect(extractRepoPath("https://github.com/acme/widgets.git")).toBe("acme/widgets")
    expect(extractRepoPath("https://github.com/acme/widgets/blob/main/README.md")).toBeNull()
    expect(extractRepoPath("https://example.com/acme/widgets")).toBeNull()
  })

  test("processPost stores a qualifying GitHub repository", async () => {
    const db = openDB(":memory:")
    globalThis.fetch = async () => new Response(JSON.stringify(githubRepo(150)), { status: 200 })

    const result = await processPost(db, hnPost("https://github.com/acme/widgets"))
    const project = getProject(db, "acme/widgets")

    expect(result).toBe("stored")
    expect(project?.stars).toBe(150)
    expect(project?.hn_score).toBe(75)
    db.close()
  })

  test("processPost fails on GitHub rate limit instead of silently skipping", async () => {
    const db = new Database(":memory:", { strict: true })
    globalThis.fetch = async () => new Response("", {
      status: 403,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "0",
      },
    })

    await expect(processPost(db, hnPost("https://github.com/acme/widgets"))).rejects.toThrow("GitHub rate limit hit")
    db.close()
  })
})
