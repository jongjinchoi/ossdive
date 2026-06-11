import { describe, expect, test } from "bun:test"
import { selectDbAsset } from "../cli/sync.ts"

describe("selectDbAsset", () => {
  test("prefers the newest versioned DB asset", () => {
    const asset = selectDbAsset([
      { id: 1, name: "ossdive.db", updated_at: "2026-06-11T10:00:00Z", browser_download_url: "" },
      { id: 2, name: "ossdive-100.db", updated_at: "2026-06-11T09:00:00Z", browser_download_url: "" },
      { id: 3, name: "ossdive-101.db", updated_at: "2026-06-11T11:00:00Z", browser_download_url: "" },
    ])

    expect(asset?.id).toBe(3)
  })

  test("falls back to the legacy ossdive.db asset", () => {
    const asset = selectDbAsset([
      { id: 1, name: "ossdive.db", updated_at: "2026-06-11T10:00:00Z", browser_download_url: "" },
    ])

    expect(asset?.id).toBe(1)
  })
})
