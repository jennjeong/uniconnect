import type { Match, Role } from "../types"

// What a new member fills in so the other side finds and picks it, in the
// order the dashboard's checklist lists them: the introduction (with the
// offer), the logo, a brand's store address, tags, SNS, the portfolio, and
// a first event or campaign.
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
