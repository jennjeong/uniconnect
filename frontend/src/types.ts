// Shapes returned by the backend API (backend/src/types.ts).
export type Role = "학생단체" | "브랜드"

export type Industry =
  | "cafe"
  | "photo"
  | "wellness"
  | "performance"
  | "content"
  | "sports"

export type Match = {
  id: string
  name: string
  category: string
  industry: Industry
  logo?: string
  offer: string
  score: number
  tags: string[]
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

export type EventItem = {
  id: string
  name: string
  date: string
  people: string
  types: string[]
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

export type NavLabel = "대시보드" | "추천 매칭" | "내 행사" | "성과 측정" | "리포트"

export type ModalName =
  | "event"
  | "notifications"
  | "report"
  | "qr"
  | "profile"
  | "login"
  | "signup"
