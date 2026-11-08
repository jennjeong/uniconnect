import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

import { clearDraft, clearDraftsOf, draftGeneration, draftKey, loadDraft, saveDraft } from "./drafts"

describe("form drafts", () => {
  let storage: Map<string, string>
  beforeEach(() => {
    storage = new Map()
    // Object.keys(localStorage)가 저장된 키를 돌려주도록.
    vi.stubGlobal(
      "localStorage",
      new Proxy(
        {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => void storage.set(key, value),
          removeItem: (key: string) => void storage.delete(key),
        },
        { ownKeys: () => [...storage.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) },
      ),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  test("each account and form keeps its own draft", () => {
    saveDraft(draftKey("a", "new"), { name: "A의 공연" })
    saveDraft(draftKey("b", "new"), { name: "B의 공연" })
    saveDraft(draftKey("a", "edit:1"), { name: "고치는 중" })
    expect(loadDraft<{ name: string }>(draftKey("a", "new"))?.data.name).toBe("A의 공연")
    expect(loadDraft<{ name: string }>(draftKey("b", "new"))?.data.name).toBe("B의 공연")
    clearDraft(draftKey("a", "new"))
    expect(loadDraft(draftKey("a", "new"))).toBeNull()
    expect(loadDraft(draftKey("a", "edit:1"))).not.toBeNull()
  })

  test("logging out clears that account's drafts only", () => {
    saveDraft(draftKey("a", "new"), { name: "A" })
    saveDraft(draftKey("b", "new"), { name: "B" })
    const before = draftGeneration()
    clearDraftsOf("a")
    // 열려 있던 양식은 이 값이 바뀐 것을 보고 내려가며 다시 저장하지 않는다.
    expect(draftGeneration()).toBe(before + 1)
    expect(loadDraft(draftKey("a", "new"))).toBeNull()
    expect(loadDraft(draftKey("b", "new"))).not.toBeNull()
  })

  test("a month-old draft is dropped", () => {
    saveDraft(draftKey("a", "new"), { name: "오래된" }, new Date("2026-01-01T00:00:00Z"))
    expect(loadDraft(draftKey("a", "new"), Date.parse("2026-03-01T00:00:00Z"))).toBeNull()
  })

  test("blocked storage just does nothing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    })
    expect(saveDraft(draftKey("a", "new"), { name: "x" })).toBeNull()
    expect(loadDraft(draftKey("a", "new"))).toBeNull()
  })
})
