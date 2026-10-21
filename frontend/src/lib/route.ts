import type { NavLabel, Role } from "../types"
import { fromIsoDate, todayIso } from "./date"

// What is on screen. Each view gets its own address in the browser history,
// so the back and forward buttons, swipe gestures (Safari on iPhone and Mac)
// and a refresh all work.
export type View = {
  page: NavLabel
  // Day the registration page opens on, while it is open.
  create?: string
  // The 내 정보 page, or its profile editor.
  profile?: "page" | "edit"
  // The message list, or one conversation.
  messages?: true
  chat?: string
  // Brand or group whose detail page is open.
  detail?: string
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
  대시보드: "",
  "추천 매칭": "matches",
  "내 행사": "events",
  "성과 측정": "measurement",
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
  if (view.create) return `${base}/new?date=${view.create}`
  if (view.profile) return `${base}/me${view.profile === "edit" ? "/edit" : ""}`
  if (view.chat) return `${base}/messages/${encodeURIComponent(view.chat)}`
  if (view.messages) return `${base}/messages`
  const path = pagePaths[view.page]
  return `${base}/${view.detail ? `${path}/${encodeURIComponent(view.detail)}` : path}`
}

export function readView(location: Location = window.location): View {
  const [first = "", second] = location.pathname.slice(base.length).split("/").filter(Boolean)
  if (first === "new") {
    const date = new URLSearchParams(location.search).get("date") ?? ""
    return { page: "대시보드", create: fromIsoDate(date) ? date : todayIso() }
  }
  if (first === "me") return { page: "대시보드", profile: second === "edit" ? "edit" : "page" }
  if (first === "messages") {
    return second ? { page: "대시보드", chat: decodeURIComponent(second) } : { page: "대시보드", messages: true }
  }
  const page =
    (Object.keys(pagePaths) as NavLabel[]).find((label) => pagePaths[label] === first) ??
    "대시보드"
  return second ? { page, detail: decodeURIComponent(second) } : { page }
}
