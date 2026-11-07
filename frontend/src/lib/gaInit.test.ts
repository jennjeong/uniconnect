import { describe, expect, it } from "vitest"

import { gaInitScript } from "./gaInit"

// 만든 스크립트를 가짜 브라우저에서 돌려 GA 전송이 꺼지는지 본다.
function run(path: string, referrer = "") {
  const origin = "https://example.com"
  const calls: unknown[][] = []
  const listeners: Record<string, () => void> = {}
  const location = { origin, href: `${origin}${path}` }
  const history = {
    pushState(_state: unknown, _title: string, address: string) {
      location.href = new URL(address, location.href).href
    },
    replaceState() {},
  }
  const window = {
    dataLayer: [] as IArguments[],
    addEventListener: (name: string, listener: () => void) => void (listeners[name] = listener),
  } as Record<string, unknown> & { dataLayer: IArguments[] }
  new Function("window", "dataLayer", "location", "history", "document", gaInitScript("G-TEST"))(
    window,
    window.dataLayer,
    location,
    history,
    { referrer },
  )
  for (const entry of window.dataLayer) calls.push(Array.from(entry))
  return { window, history, calls: () => window.dataLayer.map((entry) => Array.from(entry)), first: calls }
}

const off = "ga-disable-G-TEST"

describe("Google Analytics on pages with tokens in their address", () => {
  it("stays off on shared reports, public ledgers and invites", () => {
    for (const path of ["/report/secret", "/ledger/secret", "/invite/secret"]) expect(run(path).window[off]).toBe(true)
  })

  it("stays on elsewhere, including addresses that only start alike", () => {
    for (const path of ["/", "/explore", "/reports", "/invited"]) expect(run(path).window[off]).toBe(false)
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

  it("hides a token in the referrer after a full page load", () => {
    const config = run("/", "https://example.com/report/secret").first.find((call) => call[0] === "config")
    expect(config?.[2]).toEqual({ page_referrer: "https://example.com/" })
    expect(run("/", "https://www.google.com/").first.find((call) => call[0] === "config")?.[2]).toEqual({})
  })
})
