import { describe, expect, it } from "vitest"

import { isChunkLoadError, reloadForNewDeploy } from "./staleChunks"

const memory = () => {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
}

describe("stale chunks after a deploy", () => {
  it("knows a failed lazy import from other errors", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true)
    expect(isChunkLoadError(new TypeError("e.at is not a function"))).toBe(false)
  })

  it("reloads once, and not again right away", () => {
    const storage = memory()
    let reloads = 0
    expect(reloadForNewDeploy(1_000_000, storage, () => (reloads += 1))).toBe(true)
    expect(reloadForNewDeploy(1_030_000, storage, () => (reloads += 1))).toBe(false)
    expect(reloadForNewDeploy(1_070_000, storage, () => (reloads += 1))).toBe(true)
    expect(reloads).toBe(2)
  })
})
