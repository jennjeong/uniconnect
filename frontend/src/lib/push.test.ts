import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { keyBytes, pushSupportOf } from "./push"

const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8")

describe("device notifications", () => {
  it("says why they can't be turned on here", () => {
    expect(pushSupportOf({ supported: true, ios: false, permission: "default" })).toBe("ok")
    expect(pushSupportOf({ supported: true, ios: false, permission: "granted" })).toBe("ok")
    expect(pushSupportOf({ supported: true, ios: false, permission: "denied" })).toBe("denied")
    // iPhone의 Safari 탭에는 푸시가 없고, 홈 화면에 추가한 앱에는 있다.
    expect(pushSupportOf({ supported: false, ios: true })).toBe("ios")
    expect(pushSupportOf({ supported: true, ios: true, permission: "default" })).toBe("ok")
    expect(pushSupportOf({ supported: false, ios: false })).toBe("unsupported")
  })

  it("reads the server's key as the browser wants it", () => {
    expect([...keyBytes("AQID")]).toEqual([1, 2, 3])
    expect([...keyBytes("-_8")]).toEqual([251, 255])
    expect(keyBytes("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4")).toHaveLength(65)
  })
})

// 서비스 워커(public/sw.js)를 브라우저 대신 흉내 낸 자리에서 돌린다.
type Shown = { title: string; options: { body: string; tag: string; data: { path: string } } }

function runWorker(tabs: { url: string; navigate: (url: string) => Promise<unknown> }[] = []) {
  const handlers: Record<string, (event: object) => void> = {}
  const shown: Shown[] = []
  const opened: string[] = []
  const self = {
    addEventListener: (type: string, handler: (event: object) => void) => (handlers[type] = handler),
    skipWaiting: () => undefined,
    location: { origin: "https://uniconnect.example" },
    registration: {
      scope: "https://uniconnect.example/",
      showNotification: async (title: string, options: Shown["options"]) => void shown.push({ title, options }),
    },
    clients: { matchAll: async () => tabs, openWindow: async (url: string) => void opened.push(url), claim: async () => undefined },
  }
  new Function("self", "caches", worker)(self, {})
  const fire = async (type: string, event: object) => {
    const waits: Promise<unknown>[] = []
    handlers[type]({ ...event, waitUntil: (wait: Promise<unknown>) => waits.push(wait) })
    await Promise.all(waits)
  }
  return { shown, opened, fire }
}

const press = (path: unknown) => ({ notification: { close: () => undefined, data: { path } } })

describe("the service worker's notices", () => {
  it("shows every push, with the screen it leads to", async () => {
    const { shown, fire } = runWorker()
    await fire("push", { data: { json: () => ({ title: "새 협찬 제안이 왔어요", body: "첫 줄", path: "/offers" }) } })
    await fire("push", { data: null })
    await fire("push", { data: { json: () => JSON.parse("not json") } })
    expect(shown.map(({ title, options }) => [title, options.body, options.data.path])).toEqual([
      ["새 협찬 제안이 왔어요", "첫 줄", "/offers"],
      ["uniconnect", "", "/"],
      ["uniconnect", "", "/"],
    ])
  })

  it("opens its screen on this site only", async () => {
    const { opened, fire } = runWorker()
    for (const path of ["/messages/1", "/inbox?box=sent", "//evil.example/x", "https://evil.example/x", "javascript:alert(1)", undefined]) {
      await fire("notificationclick", press(path))
    }
    expect(opened).toEqual([
      "https://uniconnect.example/messages/1",
      "https://uniconnect.example/inbox?box=sent",
      "https://uniconnect.example/evil.example/x",
      "https://uniconnect.example/",
      "https://uniconnect.example/",
      "https://uniconnect.example/",
    ])
  })

  it("uses a tab that is already open, or a new one when it can't", async () => {
    const moves: string[] = []
    const tab = { url: "https://uniconnect.example/faq", navigate: async (url: string) => (moves.push(url), { focus: async () => undefined }) }
    const one = runWorker([tab])
    await one.fire("notificationclick", press("/offers"))
    expect([moves, one.opened]).toEqual([["https://uniconnect.example/offers"], []])
    const stuck = runWorker([{ ...tab, navigate: async () => Promise.reject(new Error("no")) }])
    await stuck.fire("notificationclick", press("/offers"))
    expect(stuck.opened).toEqual(["https://uniconnect.example/offers"])
  })
})
