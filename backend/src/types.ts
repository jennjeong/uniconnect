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

// An SNS account on a listing, like 인스타그램 @syu_muse with 3,100명.
export type SnsAccount = { platform: string; handle: string; followers?: string }

// Brands: past collaborations; student groups: past events and sponsorships.
export type PortfolioItem = { title: string; detail: string }

// A brand or student group listing that the other side browses. Accounts
// edit their own listing from 내 정보.
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
  // Detail page: a short introduction, key facts (labels per side in
  // lib/validation.ts), SNS accounts and a portfolio.
  intro?: string
  facts?: { label: string; value: string }[]
  sns?: SnsAccount[]
  portfolio?: PortfolioItem[]
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
  // The account's own listing: brands in the brand catalog (which also
  // receives the proposals student groups send), student groups in the
  // group catalog.
  brandId?: string
  groupId?: string
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
  // ROAS goal in percent, set before the sponsorship.
  targetRoas: number
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

// One side of a conversation: the student group or the brand.
export type ChatSide = "group" | "brand"

export type ChatMessage = {
  id: string
  from: ChatSide
  // Empty once deleted.
  text: string
  at: string
  // When the sender edited or deleted it; both sides are shown which.
  editedAt?: string
  deletedAt?: string
}

// Messages between a student group and a brand, by their listing ids.
export type Conversation = {
  id: string
  groupId: string
  brandId: string
  messages: ChatMessage[]
  // When each side last read the conversation.
  readAt: Partial<Record<ChatSide, string>>
}

export type Database = {
  accounts: Account[]
  sessions: Session[]
  emailCodes: EmailCode[]
  // Every brand student groups can browse, and every group brands can.
  // Each side's recommended matches are the other catalog's top three.
  brands: Match[]
  groups: Match[]
  // 2 once the catalogs carry SNS and portfolios (store.ts upgrades older files).
  catalogVersion?: number
  conversations: Conversation[]
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
