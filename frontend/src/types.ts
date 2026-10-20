// Shapes returned by the backend API (backend/src/types.ts).
export type Role = "학생단체" | "브랜드"

export type Industry =
  | "cafe"
  | "photo"
  | "wellness"
  | "performance"
  | "content"
  | "sports"
  | "beauty"
  | "education"

export type Match = {
  id: string
  name: string
  category: string
  industry: Industry
  logo?: string
  offer: string
  score: number
  tags: string[]
  // Sponsorships with student groups this semester (brand catalog only).
  popularity?: number
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

export type EventItem = {
  id: string
  name: string
  // Calendar day as "YYYY-MM-DD".
  date: string
  people: string
  types: string[]
  // What "기타" in types means, written by the organizer.
  typeNote?: string
  status: EventStatus
}

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  createdAt: string
}

export type Session = { token: string; account: Account }

export type Metrics = { scans: number; coupons: number; visits: number }

export type MetricKind = keyof Metrics

export type MetricEntry = {
  id: string
  kind: MetricKind
  at: string
  participant: string
  detail: string
}

export type Report = {
  eventName: string
  eventDate: string
  expectedAudience: number
  sponsorValue: number
  reach: number
  roas: number
  targets: {
    reach: number
    scans: number
    coupons: number
    visits: number
    qrRate: number
    visitRate: number
    roas: number
  }
  hourlyScans: { hour: number; scans: number }[]
  valueBreakdown: { type: string; value: number }[]
}

export type NavLabel = "대시보드" | "추천 매칭" | "내 행사" | "성과 측정" | "리포트"

export type ModalName =
  | "notifications"
  | "report"
  | "qr"
  | "profile"
  | "login"
  | "signup"
  | "metric-log"
  | "goal"
