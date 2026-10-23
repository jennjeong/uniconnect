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

export type SnsAccount = { platform: string; handle: string; followers?: string }

// Brands: past collaborations; student groups: past events and sponsorships.
export type PortfolioItem = { title: string; detail: string }

export type Match = {
  id: string
  name: string
  category: string
  industry: Industry
  logo?: string
  offer: string
  // Match for the account browsing, with the reasons that count most.
  score: number
  reasons?: string[]
  tags: string[]
  // Sponsorships with student groups this semester (brand catalog only).
  popularity?: number
  // Brand catalog only: the store's address, and its coordinates once a map
  // service has placed it.
  location?: { address: string; lat?: number; lng?: number }
  // Km from the account browsing (its campus or store); absent when either
  // place is unknown.
  distanceKm?: number
  // Student group catalog only: school, next event and its expected audience.
  school?: string
  eventName?: string
  eventDate?: string
  audience?: number
  // Detail page: a short introduction, key facts, SNS and a portfolio.
  intro?: string
  facts?: { label: string; value: string }[]
  sns?: SnsAccount[]
  portfolio?: PortfolioItem[]
}

// The parts of its listing an account writes itself in 내 정보.
// `logo`: a data URL to set, null to remove, left out to keep.
// A real shop near the campus, live from Kakao Local (GET /api/places).
export type NearbyPlace = {
  id: string
  name: string
  category: string
  address: string
  phone?: string
  distanceM: number
  // Its page on Kakao Map.
  url: string
}

// map is false while the server has no map key; campus is null for a school
// not on the map.
export type NearbyPlaces = { map: boolean; campus: string | null; places: NearbyPlace[] }

export type ProfileDraft = Pick<Match, "intro" | "offer" | "tags" | "facts" | "sns" | "portfolio"> & {
  logo?: string | null
  // A brand's store address; empty removes it.
  address?: string
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

export type EventItem = {
  id: string
  name: string
  // Calendar day as "YYYY-MM-DD"; the first day when it runs over several.
  date: string
  // Last day of an event that runs over several days; absent for one day.
  endDate?: string
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
  // The account's own listing: brands in the brand catalog, student
  // groups in the group catalog.
  brandId?: string
  groupId?: string
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

// A sponsorship proposal a brand sent to a student group.
export type SponsorOffer = {
  id: string
  groupId: string
  brandId?: string
  brandName: string
  industry: Industry
  campaignName: string
  // "YYYY-MM-DD", or "" while the brand has no campaign scheduled.
  campaignDate: string
  offer: string
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

export type ChatMessage = {
  id: string
  // Empty once deleted.
  text: string
  at: string
  mine: boolean
  // Own messages only: whether the partner has read it.
  read?: boolean
  // When the sender edited or deleted it; both sides are shown which.
  editedAt?: string
  deletedAt?: string
}

// A conversation with a brand (for student groups) or a group (for brands).
// A question this account sent the operators, with their answer once given.
export type Inquiry = {
  id: string
  category: string
  question: string
  createdAt: string
  answer?: string
  answeredAt?: string
}

// A question as the operators see it, with who sent it.
export type AdminInquiry = Inquiry & {
  from: { name: string; role: Role; email: string } | null
}

export type Conversation = {
  id: string
  partner: {
    id: string
    name: string
    category: string
    industry: Industry
    school?: string
    // Messages only reach partners who have an account.
    hasAccount: boolean
  }
  lastMessage: { text: string; at: string; mine: boolean; deleted?: boolean } | null
  unread: number
  messages?: ChatMessage[]
}

export type Report = {
  eventId: string
  // In the event's check-in address.
  code: string
  eventName: string
  eventDate: string
  // Last day of an event over several days.
  eventEndDate?: string
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
  // QR scans by day (YYYY-MM-DD, Korea) and hour.
  hourlyScans: { date: string; hour: number; scans: number }[]
  valueBreakdown: { type: string; value: number }[]
  // Inputs the figures above come from: won a participant spends at the
  // sponsor's store, and reach beyond the venue.
  averageSpend: number
  snsReach: number
  coupon: { store: string; title: string }
  // 4 digits store staff enter to confirm a visit; only for the owner.
  staffPin?: string
  // Once brands sponsor the event, each one's own coupon, counts and value;
  // participants then take these coupons instead of the event's.
  sponsors?: SponsorReport[]
}

export type SponsorReport = {
  // The brand's sponsorship.
  id: string
  brandName: string
  coupon: { store: string; title: string }
  // Won this sponsor gave (an even split until the group sets each).
  value: number
  coupons: number
  visits: number
  roas: number
  // Its store staff's PIN; only for the owner.
  staffPin?: string
}

// One event of the group with its live counts and report.
export type EventMeasurement = {
  eventId: string
  metrics: Metrics
  report: Report
}

// What a participant sees after scanning an event's QR.
export type CheckInInfo = {
  eventName: string
  eventDate: string
  groupName: string
  // One per sponsor, or the event's own ("event") before any.
  coupons: { id: string; store: string; title: string }[]
}

// Student groups and brands each have their own menu (data/navigation.ts).
export type NavLabel =
  | "대시보드"
  | "추천 매칭"
  | "받은 협찬"
  | "내 행사"
  | "성과 측정"
  | "리포트"
  | "단체 찾기"
  | "받은 제안"
  | "행사 일정"
  | "성과 분석"

export type ModalName =
  | "report"
  | "qr"
  | "login"
  | "signup"
  | "reset"
  | "leave"
  | "measure-goals"
  | "password"
  | "metric-log"
  | "goal"
  | "ask"
