import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { ApiError, getToken, request, setToken, tokenPersists } from "./client"

const respond = (status: number, body: string) =>
  Promise.resolve(new Response(status === 204 ? null : body, { status, headers: { "Content-Type": "application/json" } }))

describe("api client", () => {
  let storage: Map<string, string>
  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal("window", { location: { origin: "http://localhost" }, setTimeout, clearTimeout })
    vi.stubGlobal("navigator", { onLine: true })
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    })
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    setToken(null)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise
    } catch (error) {
      return error as ApiError
    }
    throw new Error("expected a failure")
  }

  test("the API's own error message comes through with its status", async () => {
    vi.stubGlobal("fetch", () => respond(409, JSON.stringify({ error: "이미 답한 제안이에요." })))
    const error = await failure(request("/requests/1/accept", { method: "POST" }))
    expect([error.status, error.kind, error.message]).toEqual([409, "server", "이미 답한 제안이에요."])
  })

  test("a host error without { error } reads as a server problem, not a developer hint", async () => {
    vi.stubGlobal("fetch", () => respond(502, "<html>Bad gateway</html>"))
    const error = await failure(request("/site"))
    expect(error.kind).toBe("server")
    expect(error.message).not.toMatch(/백엔드/)
  })

  test("a success that isn't JSON is an invalid answer, not null", async () => {
    vi.stubGlobal("fetch", () => respond(200, "not json"))
    expect((await failure(request("/site"))).kind).toBe("invalid")
  })

  test("a request the page cancels is aborted, and is not retried", async () => {
    const controller = new AbortController()
    const fetcher = vi.fn((_url: URL, init: RequestInit) => {
      controller.abort()
      return Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError", init }))
    })
    vi.stubGlobal("fetch", fetcher)
    expect((await failure(request("/conversations/1", { signal: controller.signal }))).kind).toBe("aborted")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test("a request that takes too long times out", async () => {
    vi.stubGlobal("fetch", (_url: URL, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    )
    expect((await failure(request("/site", { method: "POST", timeoutMs: 10 }))).kind).toBe("timeout")
  })

  test("offline is told apart from an unreachable server", async () => {
    vi.stubGlobal("navigator", { onLine: false })
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")))
    expect((await failure(request("/site", { method: "POST" }))).kind).toBe("offline")
  })

  test("reads retry once after a dropped connection, writes never do", async () => {
    const reads = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockImplementation(() => respond(200, "{}"))
    vi.stubGlobal("fetch", reads)
    await expect(request("/site")).resolves.toEqual({})
    expect(reads).toHaveBeenCalledTimes(2)

    const writes = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    vi.stubGlobal("fetch", writes)
    expect((await failure(request("/proposals", { method: "POST", body: {} }))).kind).toBe("network")
    expect(writes).toHaveBeenCalledTimes(1)
  })

  test("with storage blocked the token lives in memory, so the API still sees the session", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      },
    })
    setToken("token-1")
    expect(getToken()).toBe("token-1")
    expect(tokenPersists()).toBe(false)
    const fetcher = vi.fn((_url: URL, _init: RequestInit) => respond(200, "{}"))
    vi.stubGlobal("fetch", fetcher)
    await request("/auth/me")
    expect((fetcher.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer token-1")
    setToken(null)
    expect(getToken()).toBeNull()
  })
})
