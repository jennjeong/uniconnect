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
  // Student group catalog only: school, next event and its expected audience.
  school?: string
  eventName?: string
  eventDate?: string
  audience?: number
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
  createdAt: string
}

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  // Brand accounts listed in the brand catalog: their catalog id, which
  // receives the proposals student groups send.
  brandId?: string
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

export type RequestStatus = "검토 중" | "수락" | "거절"

// A sponsorship proposal a student group sent to a brand.
export type SponsorRequest = {
  id: string
  brandId: string
  // Student account that sent it; seeded examples have none.
  fromAccountId?: string
  // That account's event the proposal is about; accepting it confirms the event.
  eventId?: string
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
  // Won spent, cash and in-kind.
  spend: number
  coupons: number
  visits: number
  // Estimated store sales the sponsorship brought, in won.
  sales: number
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
  // Every student group brands can browse; matches.브랜드 is its top three.
  groups: Match[]
  // Proposals from student groups to brands, answered by the brand.
  requests: SponsorRequest[]
  // Finished sponsorships, keyed by brand account id.
  sponsorships: Record<string, Sponsorship[]>
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
