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
  // Logo image URL; the frontend shows an industry graphic when it is missing.
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
  createdAt: string
}

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  passwordHash: string
  termsAgreedAt: string
  createdAt: string
}

export type PublicAccount = Omit<Account, "passwordHash" | "termsAgreedAt">

export type Session = {
  token: string
  accountId: string
  expiresAt: number
}

export type EmailCode = {
  email: string
  role: Role
  code: string
  expiresAt: number
  attempts: number
  verificationToken?: string
  verifiedUntil?: number
}

export type Metrics = {
  scans: number
  coupons: number
  visits: number
}

export type MetricKind = keyof Metrics

// One recorded QR scan, coupon or store visit.
export type MetricEntry = {
  id: string
  kind: MetricKind
  at: string
  participant: string
  detail: string
}

// Performance report of the measured event, with the goals set before it.
export type Report = {
  eventName: string
  eventDate: string
  expectedAudience: number
  // Total sponsorship value in won, cash and in-kind.
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

export type Database = {
  accounts: Account[]
  sessions: Session[]
  emailCodes: EmailCode[]
  // Recommended partners for each side: brands for student groups and vice versa.
  matches: Record<Role, Match[]>
  // Every brand student groups can browse; matches.학생단체 is its top three.
  brands: Match[]
  // Keyed by account id.
  events: Record<string, EventItem[]>
  proposals: Record<string, string[]>
  // Accounts whose events are shown to visitors who are not logged in.
  demoAccountIds: Record<Role, string>
  metrics: Metrics
  // Most recent measurement records, oldest first.
  metricLog: MetricEntry[]
  report: Report
}
