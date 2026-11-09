import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { ApiError, getToken, request, requestBlob, setToken, tokenPersists } from "./client"

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

  // 파일 본문을 흘려보내는 응답. 첫 조각을 보낸 뒤 멈추거나(stall) 끊긴다(break).
  // 실제 fetch처럼 요청의 signal이 멈추면 본문 읽기도 실패한다.
  const streaming = (mode: "stall" | "break") => (_url: string, init: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([37, 80, 68, 70]))
        if (mode === "break") controller.error(new TypeError("network error"))
        init.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")))
      },
    })
    return Promise.resolve(new Response(body, { status: 200, headers: { "Content-Type": "application/pdf" } }))
  }

  test("a file whose body stalls after the headers times out instead of waiting forever", async () => {
    vi.stubGlobal("fetch", streaming("stall"))
    const error = await failure(requestBlob("/events/e1/plan", { timeoutMs: 30 }))
    expect([error.kind, error.message]).toEqual(["timeout", "응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요."])
  })

  test("a file whose body breaks off is a readable network failure", async () => {
    vi.stubGlobal("fetch", streaming("break"))
    const error = await failure(requestBlob("/events/e1/plan"))
    expect(error).toBeInstanceOf(ApiError)
    expect(error.kind).toBe("network")
  })

  test("a file the page stops waiting for is aborted, not a network failure", async () => {
    vi.stubGlobal("fetch", streaming("stall"))
    const controller = new AbortController()
    const pending = failure(requestBlob("/events/e1/plan", { signal: controller.signal }))
    controller.abort()
    expect((await pending).kind).toBe("aborted")
  })

  test("a refused file carries the API's own message, and a whole file comes back", async () => {
    vi.stubGlobal("fetch", () => respond(404, JSON.stringify({ error: "기획안이 없어요." })))
    const error = await failure(requestBlob("/events/e1/plan"))
    expect([error.status, error.kind, error.message]).toEqual([404, "server", "기획안이 없어요."])

    vi.stubGlobal("fetch", () => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })))
    expect((await requestBlob("/events/e1/plan")).size).toBe(3)
  })
})
