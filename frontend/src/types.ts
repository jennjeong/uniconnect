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
  // Student group catalog only: school, next event and its expected audience.
  school?: string
  eventName?: string
  eventDate?: string
  audience?: number
  // Detail page: a short introduction and key facts.
  intro?: string
  facts?: { label: string; value: string }[]
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
  // Campaign budget in won (brand accounts only).
  budget?: number
  status: EventStatus
}

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  // Brand accounts: the catalog id that receives student proposals.
  brandId?: string
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

export type RequestStatus = "검토 중" | "수락" | "거절"

// A sponsorship proposal a student group sent to a brand.
export type SponsorRequest = {
  id: string
  brandId: string
  groupName: string
  school: string
  industry: Industry
  eventName: string
  // "YYYY-MM-DD", or "" while the group has no event scheduled.
  eventDate: string
  people: string
  ask: string
  message: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
}

// One finished sponsorship of a brand, for its analytics.
export type Sponsorship = {
  id: string
  groupName: string
  eventName: string
  date: string
  spend: number
  coupons: number
  visits: number
  sales: number
  // ROAS goal in percent.
  targetRoas: number
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

// Student groups and brands each have their own menu (data/navigation.ts).
export type NavLabel =
  | "대시보드"
  | "추천 매칭"
  | "내 행사"
  | "성과 측정"
  | "리포트"
  | "단체 찾기"
  | "받은 제안"
  | "캠페인"
  | "성과 분석"

export type ModalName =
  | "report"
  | "qr"
  | "login"
  | "signup"
  | "metric-log"
  | "goal"
