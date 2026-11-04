import type { LegalKind } from "../data/legal"
import type { NavLabel, Role } from "../types"
import { fromIsoDate, todayIso } from "./date"

// 화면에 떠 있는 것. 각 view는 브라우저 기록에 자기 주소를 가지므로,
// 뒤로·앞으로 버튼, 스와이프 제스처(iPhone과 Mac의 Safari), 새로고침이 모두
// 동작한다.
export type View = {
  page: NavLabel
  // 방문자가 처음 닿는 소개(/). 대시보드는 /dashboard에 있다.
  home?: true
  // 등록 페이지가 열릴 때, 열려 있는 동안의 날짜.
  create?: string
  // 새 행사가 그 내용으로 시작하는 기존 행사(행사 복제)를 id로.
  copy?: string
  // 같은 양식에서 고치고 있는 행사나 캠페인을 id로.
  edit?: string
  // 학생단체의 행사 페이지를 행사 id로 (/event/<id>).
  eventPage?: string
  // 모집 게시판(/board), 또는 그 안의 글 하나(/board/<id>).
  board?: true
  post?: string
  // 내 정보 페이지 또는 그 프로필 편집기.
  profile?: "page" | "edit"
  // 메시지 목록, 또는 대화 하나.
  messages?: true
  chat?: string
  // 상세 페이지가 열려 있는 브랜드나 단체.
  detail?: string
  // FAQ 페이지. 여기서 운영자에게 질문도 보낸다.
  faq?: true
  // 이용약관 또는 개인정보처리방침.
  legal?: LegalKind
  // 질문에 답하는 운영자 화면 (/admin).
  admin?: true
  // 학생단체가 매장에 보내는 초대를 코드로 (/invite/<code>).
  invite?: string
  // 계정의 협찬 합의서들, 또는 그중 하나를 제안으로.
  agreements?: true
  agreement?: string
  // 학생회의 동아리들 (/council).
  council?: true
  // 행사 둘러보기: 다른 단체의 다가오는 행사와 비슷한 행사의 사례 (/explore).
  explore?: true
  // 협찬 하나에 대한 브랜드의 상세 리포트 (/insights/<id>), 또는 링크로 읽기
  // 전용으로 공유한 것 (/report/<token>).
  insight?: string
  sharedReport?: string
  // 학생단체의 공개 협찬 장부를 링크로 (/ledger/<token>).
  ledger?: string
  // 어느 화면에도 없는 주소. 입력된 그대로 둔다 (404 페이지).
  missing?: string
}

// 메뉴가 표시하도록, view가 속한 메뉴 페이지: 그 페이지 자체 또는 그 안의
// 브랜드나 단체. 다른 화면(게시판, FAQ, 내 정보, 양식 등)은 어디에도 속하지
// 않으므로, 그것들이 열려 있는 동안 선택된 페이지가 없다.
export function menuPageOf(view: View, page: NavLabel): NavLabel | undefined {
  const others = Object.entries(view).filter(([key, value]) => !["page", "detail"].includes(key) && value !== undefined)
  return others.length === 0 ? page : undefined
}

// App이 각 항목에 대해 history.state에 보관하는 것.
export type HistoryEntry = {
  view: View
  // 이 앱이 이 항목 앞에 푸시한 항목 수. 첫 항목이면 0.
  index: number
  // 사용자가 떠날 때 페이지가 스크롤돼 있던 위치.
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

// 페이지가 속한 역할. 대시보드는 둘 다에 속한다.
export function roleOfPage(page: NavLabel): Role | undefined {
  if (page === "대시보드") return undefined
  return brandPages.includes(page) ? "브랜드" : "학생단체"
}

// 앱은 기본 경로(base path) 아래에서 서빙될 수 있다 (vite.config.ts).
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
  if (view.explore) return `${base}/explore`
  if (view.insight) return `${base}/insights/${encodeURIComponent(view.insight)}`
  if (view.sharedReport) return `${base}/report/${encodeURIComponent(view.sharedReport)}`
  if (view.ledger) return `${base}/ledger/${encodeURIComponent(view.ledger)}`
  const path = pagePaths[view.page]
  return `${base}/${view.detail ? `${path}/${encodeURIComponent(view.detail)}` : path}`
}

// 기록 항목이 보관한 view. 단, 항목이 있는 주소와 더는 맞지 않으면(주소가
// 바뀌기 전에 보관된 것, 예컨대 대시보드가 /에서 /dashboard로 옮겨 간 경우)
// 주소가 정한다.
export function entryView(entry: HistoryEntry | null, location: Location = window.location): View {
  const kept = entry?.view
  return kept && viewPath(kept) === location.pathname + location.search ? kept : readView(location)
}

// 입력된 그대로의 세그먼트. 깨진 이스케이프("%E0" 등)가 있어서
// decodeURIComponent가 읽지 못하면 undefined.
function decodeSegment(segment: string) {
  try {
    return decodeURIComponent(segment)
  } catch {
    return undefined
  }
}

// 주소가 뒤에 브랜드나 단체를 붙여 가리킬 수 있는 페이지.
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
  if (first === "explore") return second ? missing : { page: "대시보드", explore: true }
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
  if (first === "ledger") return named && /^[\w-]+$/.test(named) ? { page: "대시보드", ledger: named } : missing
  if (first === "agreements") {
    return named ? { page: "대시보드", agreement: named } : { page: "대시보드", agreements: true }
  }
  const page = (Object.keys(pagePaths) as NavLabel[]).find((label) => pagePaths[label] === first)
  if (!page || (second && !detailPaths.includes(first))) return missing
  return named ? { page, detail: named } : { page }
}
