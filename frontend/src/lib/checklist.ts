import type { Match, Role } from "../types"

// 새 회원이 상대가 자신을 찾아 고르게 하려고 채우는 것을, 대시보드 체크리스트가
// 나열하는 순서대로: 소개(제공 내용 포함), 로고, 브랜드의 매장 주소, 태그, SNS,
// 포트폴리오, 첫 행사나 캠페인.
export type ChecklistKey = "intro" | "logo" | "address" | "tags" | "sns" | "portfolio" | "event"

export type ChecklistStep = { key: ChecklistKey; done: boolean }

export function checklistSteps(role: Role, listing: Match | null, hasEvent: boolean): ChecklistStep[] {
  return [
    { key: "intro", done: Boolean(listing?.intro) },
    { key: "logo", done: Boolean(listing?.logo) },
    ...(role === "브랜드" ? [{ key: "address" as const, done: Boolean(listing?.location?.address) }] : []),
    { key: "tags", done: (listing?.tags.length ?? 0) > 0 },
    { key: "sns", done: (listing?.sns?.length ?? 0) > 0 },
    { key: "portfolio", done: (listing?.portfolio?.length ?? 0) > 0 },
    { key: "event", done: hasEvent },
  ]
}
