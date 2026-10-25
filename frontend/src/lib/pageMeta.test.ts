import { describe, expect, it } from "vitest"

import type { Match, NavLabel } from "../types"
import { pageMeta } from "./pageMeta"
import type { View } from "./route"

const meta = (view: Partial<View>, detail?: Match) => {
  const page: NavLabel = view.page ?? "대시보드"
  return pageMeta({ ...view, page }, { role: "학생단체", page, detail })
}

describe("which screens search engines may list", () => {
  it("lists the introduction, the catalogs, profiles, the FAQ and the policies", () => {
    const brand = { name: "애프터눈 커피", category: "카페", score: 92 } as Match
    for (const listed of [
      meta({ home: true }),
      meta({ page: "추천 매칭" }),
      meta({ page: "단체 찾기" }),
      meta({ page: "추천 매칭", detail: "afternoon-coffee" }, brand),
      meta({ faq: true }),
      meta({ legal: "terms" }),
      meta({ legal: "privacy" }),
    ]) {
      expect(listed.noindex).toBeUndefined()
    }
  })

  it("keeps out the dashboard, the screens for one account or one link, and the 404 page", () => {
    for (const view of [
      {},
      { page: "성과 측정" },
      { page: "받은 제안" },
      { page: "내 행사" },
      { create: "2026-11-01" },
      { profile: "page" },
      { profile: "edit" },
      { messages: true },
      { chat: "conversation-1" },
      { admin: true },
      { agreements: true },
      { agreement: "req-runners" },
      { invite: "Ab3_x-9Z" },
      { missing: "/nope" },
    ] satisfies Partial<View>[]) {
      expect(meta(view).noindex).toBe(true)
    }
  })
})
