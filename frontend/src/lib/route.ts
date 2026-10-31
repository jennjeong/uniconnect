import type { LegalKind } from "../data/legal"
import type { NavLabel, Role } from "../types"
import { fromIsoDate, todayIso } from "./date"

// What is on screen. Each view gets its own address in the browser history,
// so the back and forward buttons, swipe gestures (Safari on iPhone and Mac)
// and a refresh all work.
export type View = {
  page: NavLabel
  // The introduction visitors land on (/); the dashboard is at /dashboard.
  home?: true
  // Day the registration page opens on, while it is open.
  create?: string
  // The event whose details the new one starts from (행사 복제), by its id.
  copy?: string
  // The event or campaign being edited on the same form, by its id.
  edit?: string
  // A student group's event page, by the event's id (/event/<id>).
  eventPage?: string
  // The recruitment board (/board), or one post on it (/board/<id>).
  board?: true
  post?: string
  // The 내 정보 page, or its profile editor.
  profile?: "page" | "edit"
  // The message list, or one conversation.
  messages?: true
  chat?: string
  // Brand or group whose detail page is open.
  detail?: string
  // The FAQ page, where questions also go to the operators.
  faq?: true
  // The terms of service or the privacy policy.
  legal?: LegalKind
  // The operators' screen for answering questions (/admin).
  admin?: true
  // A student group's invitation to a shop, by its code (/invite/<code>).
  invite?: string
  // The account's sponsorship agreements, or one of them by its proposal.
  agreements?: true
  agreement?: string
  // A student council's clubs (/council).
  council?: true
  // A brand's detailed report of one sponsorship (/insights/<id>), or one
  // shared read-only by its link (/report/<token>).
  insight?: string
  sharedReport?: string
  // An address no screen has, kept as it was typed (the 404 page).
  missing?: string
}

// What App keeps in history.state for each entry.
export type HistoryEntry = {
  view: View
  // Entries this app pushed before this one; 0 for the first.
  index: number
  // Where the page was scrolled when the user moved on.
  scrollY?: number
}

const pagePaths: Record<NavLabel, string> = {
  대시보드: "dashboard",
  "추천 매칭": "matches",
  "받은 협찬": "offers",
  "내 행사": "events",
  성과: "measurement",
  리포트: "reports",
  "단체 찾기": "groups",
  "받은 제안": "inbox",
  "행사 일정": "campaigns",
  "성과 분석": "analytics",
}

const brandPages: NavLabel[] = ["단체 찾기", "받은 제안", "행사 일정", "성과 분석"]

// The role a page belongs to; the dashboard belongs to both.
export function roleOfPage(page: NavLabel): Role | undefined {
  if (page === "대시보드") return undefined
  return brandPages.includes(page) ? "브랜드" : "학생단체"
}

// The app may be served under a base path (vite.config.ts).
const base = import.meta.env.BASE_URL.replace(/\/$/, "")

export function viewPath(view: View) {
  if (view.missing) return `${base}${view.missing}`
  if (view.home) return `${base}/`
  if (view.create) return `${base}/new?date=${view.create}${view.copy ? `&from=${encodeURIComponent(view.copy)}` : ""}`
  if (view.edit) return `${base}/edit/${encodeURIComponent(view.edit)}`
  if (view.eventPage) return `${base}/event/${encodeURIComponent(view.eventPage)}`
  if (view.post) return `${base}/board/${encodeURIComponent(view.post)}`
  if (view.board) return `${base}/board`
  if (view.profile) return `${base}/me${view.profile === "edit" ? "/edit" : ""}`
  if (view.chat) return `${base}/messages/${encodeURIComponent(view.chat)}`
  if (view.messages) return `${base}/messages`
  if (view.faq) return `${base}/faq`
  if (view.legal) return `${base}/${view.legal}`
  if (view.admin) return `${base}/admin`
  if (view.invite) return `${base}/invite/${encodeURIComponent(view.invite)}`
  if (view.agreement) return `${base}/agreements/${encodeURIComponent(view.agreement)}`
  if (view.agreements) return `${base}/agreements`
  if (view.council) return `${base}/council`
  if (view.insight) return `${base}/insights/${encodeURIComponent(view.insight)}`
  if (view.sharedReport) return `${base}/report/${encodeURIComponent(view.sharedReport)}`
  const path = pagePaths[view.page]
  return `${base}/${view.detail ? `${path}/${encodeURIComponent(view.detail)}` : path}`
}

// The view a history entry kept, unless it no longer fits the address the
// entry is at (one kept before an address changed, as when the dashboard
// moved from / to /dashboard); then the address decides.
export function entryView(entry: HistoryEntry | null, location: Location = window.location): View {
  const kept = entry?.view
  return kept && viewPath(kept) === location.pathname + location.search ? kept : readView(location)
}

// A segment as typed, or undefined when it holds a broken escape such as
// "%E0", which decodeURIComponent cannot read.
function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

// Pages whose address can name a brand or group after them.
const detailPaths = [pagePaths["추천 매칭"], pagePaths["단체 찾기"]]

export function readView(location: Location = window.location): View {
  const pathname = location.pathname.slice(base.length)
  const [first = "", second, ...rest] = pathname.split("/").filter(Boolean)
  const missing: View = { page: "대시보드", missing: pathname }
  if (rest.length > 0) return missing
  if (!first) return { page: "대시보드", home: true }
  if (first === "new") {
    if (second) return missing
    const query = new URLSearchParams(location.search)
    const date = query.get("date") ?? ""
    const copy = query.get("from")
    return { page: "대시보드", create: fromIsoDate(date) ? date : todayIso(), ...(copy ? { copy } : {}) }
  }
  if (first === "me") {
    if (second && second !== "edit") return missing
    return { page: "대시보드", profile: second === "edit" ? "edit" : "page" }
  }
  if (first === "faq") return second ? missing : { page: "대시보드", faq: true }
  if (first === "terms" || first === "privacy") return second ? missing : { page: "대시보드", legal: first }
  if (first === "admin") return second ? missing : { page: "대시보드", admin: true }
  if (first === "council") return second ? missing : { page: "대시보드", council: true }
  const named = second === undefined ? undefined : decodeSegment(second)
  if (second !== undefined && named === undefined) return missing
  if (first === "messages") {
    return named ? { page: "대시보드", chat: named } : { page: "대시보드", messages: true }
  }
  if (first === "edit") return named ? { page: "대시보드", edit: named } : missing
  if (first === "event") return named ? { page: "대시보드", eventPage: named } : missing
  if (first === "board") return named ? { page: "대시보드", post: named } : { page: "대시보드", board: true }
  if (first === "invite") return named && /^[\w-]+$/.test(named) ? { page: "대시보드", invite: named } : missing
  if (first === "insights") return named ? { page: "성과 분석", insight: named } : missing
  if (first === "report") return named && /^[\w-]+$/.test(named) ? { page: "대시보드", sharedReport: named } : missing
  if (first === "agreements") {
    return named ? { page: "대시보드", agreement: named } : { page: "대시보드", agreements: true }
  }
  const page = (Object.keys(pagePaths) as NavLabel[]).find((label) => pagePaths[label] === first)
  if (!page || (second && !detailPaths.includes(first))) return missing
  return named ? { page, detail: named } : { page }
}
