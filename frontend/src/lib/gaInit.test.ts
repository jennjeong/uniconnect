import { describe, expect, it } from "vitest"

import { gaInitScript } from "./gaInit"

// 만든 스크립트를 가짜 브라우저에서 돌려 GA 전송이 꺼지는지 본다.
function run(path: string, referrer = "") {
  const origin = "https://example.com"
  const url = new URL(path, origin)
  const listeners: Record<string, () => void> = {}
  const loaded: { async?: boolean; src?: string }[] = []
  const location = { origin, href: url.href, pathname: url.pathname }
  const history = {
    pushState(_state: unknown, _title: string, address: string) {
      const next = new URL(address, location.href)
      location.href = next.href
      location.pathname = next.pathname
    },
    replaceState() {},
  }
  const window = {
    addEventListener: (name: string, listener: () => void) => void (listeners[name] = listener),
    requestIdleCallback: (callback: () => void) => callback(),
  } as Record<string, unknown> & { dataLayer?: IArguments[] }
  const document = {
    referrer,
    createElement: () => ({}),
    head: { appendChild: (tag: { src?: string }) => void loaded.push(tag) },
  }
  new Function("window", "location", "history", "document", gaInitScript("G-TEST"))(window, location, history, document)
  const calls = () => (window.dataLayer ?? []).map((entry) => Array.from(entry))
  // 태그 본체는 페이지가 다 뜬 뒤(load) 받는다.
  listeners.load?.()
  return { window, history, loaded, listeners, calls, config: () => calls().find((call) => call[0] === "config") }
}

const off = "ga-disable-G-TEST"

describe("Google Analytics on pages with tokens in their address", () => {
  it("never loads on check-in, shared reports, public ledgers and invites", () => {
    for (const path of ["/check-in/code", "/report/secret", "/ledger/secret", "/invite/secret"]) {
      const page = run(path)
      expect(page.window[off]).toBe(true)
      expect(page.loaded).toEqual([])
      expect(page.calls()).toEqual([])
    }
  })

  it("waits for the page to finish loading before fetching the tag", () => {
    const listeners: Record<string, () => void> = {}
    const loaded: unknown[] = []
    const window = {
      addEventListener: (name: string, listener: () => void) => void (listeners[name] = listener),
      requestIdleCallback: (callback: () => void) => callback(),
    }
    const document = { referrer: "", readyState: "interactive", createElement: () => ({}), head: { appendChild: (tag: unknown) => void loaded.push(tag) } }
    const location = { origin: "https://example.com", href: "https://example.com/", pathname: "/" }
    const history = { pushState() {}, replaceState() {} }
    new Function("window", "location", "history", "document", gaInitScript("G-TEST"))(window, location, history, document)
    expect(loaded).toEqual([])
    listeners.load()
    expect(loaded).toHaveLength(1)
  })

  it("loads elsewhere, including addresses that only start alike", () => {
    for (const path of ["/", "/explore", "/reports", "/invited"]) {
      const page = run(path)
      expect(page.window[off]).toBeFalsy()
      expect(page.loaded[0]?.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-TEST")
    }
  })

  it("turns off before the app moves to such a page, and hides it from the next page", () => {
    const page = run("/")
    page.history.pushState(null, "", "/report/secret")
    expect(page.window[off]).toBe(true)
    page.history.pushState(null, "", "/explore")
    expect(page.window[off]).toBe(false)
    expect(page.calls().at(-1)).toEqual(["set", "page_referrer", "https://example.com/"])
    expect(JSON.stringify(page.calls())).not.toContain("secret")
  })

  it("leaves the query out of the address, also after moving inside the app", () => {
    const page = run("/explore?code=secret")
    expect(page.config()?.[2]).toMatchObject({ page_location: "https://example.com/explore" })
    page.history.pushState(null, "", "/pricing?code=secret")
    expect(page.calls().at(-1)).toEqual(["set", "page_location", "https://example.com/pricing"])
    expect(JSON.stringify(page.calls())).not.toContain("secret")
  })

  it("keeps only an outside site's domain as the referrer", () => {
    expect(run("/", "https://example.com/report/secret").config()?.[2]).toMatchObject({ page_referrer: "" })
    expect(run("/", "https://www.google.com/search?q=secret").config()?.[2]).toMatchObject({
      page_referrer: "https://www.google.com",
    })
    expect(run("/").config()?.[2]).toMatchObject({ page_referrer: "" })
  })
})
