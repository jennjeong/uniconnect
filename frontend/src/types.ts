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
  // Match for the account browsing, with the reasons that count most and
  // each part of it as a share of its best (0 to 1).
  score: number
  reasons?: string[]
  scoreParts?: { label: string; value: number }[]
  tags: string[]
  // Sponsorships with student groups this semester (brand catalog only).
  popularity?: number
  // Brand catalog only: the store's address, and its coordinates once a map
  // service has placed it.
  location?: { address: string; lat?: number; lng?: number }
  // Brand catalog only: the shop on Kakao Map this brand is, once it joined
  // from a student group's invitation.
  kakaoPlaceId?: string
  // Its sponsorship reviews: the average stars and how many, when it has any.
  rating?: number
  reviewCount?: number
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
  // Its page on Kakao Map; the made-up shops visitors see have none.
  url?: string
  // Where it is, for the map on screen only, and the kind it was found
  // under (data/places.ts).
  lat: number
  lng: number
  kind: string
  // The student group looking invited it.
  invited?: true
  // The brand it joined as, from an invitation.
  brandId?: string
}

// map is false while the server has no map key; campus is null for a school
// not on the map. center is the campus's point, with the shops. Visitors get
// made-up shops around the demo group's campus (example), not Kakao's.
export type NearbyPlaces = {
  map: boolean
  example?: true
  campus: string | null
  center?: { lat: number; lng: number }
  places: NearbyPlace[]
}

// The two sides of a sponsorship (backend ChatSide).
export type ChatSide = "group" | "brand"

// One thing a side of an accepted proposal promised, with its proof: links
// and photos (fetched with the login token, api.agreementPhoto).
export type AgreementItem = {
  id: string
  side: ChatSide
  label: string
  doneAt?: string
  links: string[]
  photos: string[]
}

// A sponsorship's agreement (임시 전자 계약서) as one side sees it: the two sides
// (member when they have an account), the event, what the brand gives, the
// items, and when each side confirmed them as they stand.
export type Agreement = {
  id: string
  kind: "request" | "offer"
  side: ChatSide
  // Each side, with the person running it (only the two sides see this).
  group: { name: string; member: boolean; contact?: AccountContact }
  brand: { name: string; member: boolean; contact?: AccountContact }
  eventName: string
  eventDate: string
  // The event, while the side whose it is has it (a group's event for a
  // request, a brand's campaign for an offer), and its goals: set on the
  // agreement until the event begins, read by both sides.
  event?: { id: string; owner: ChatSide; started: boolean }
  goals?: { expectedAudience: number; targets: Report["targets"] }
  gives: string
  items: AgreementItem[]
  confirmed: Partial<Record<ChatSide, string>>
  createdAt: string
  updatedAt: string
  // How the sponsorship is confirmed at the event (data/methods.ts): the
  // methods as set here, the ones both sides last confirmed (which count,
  // once there are any), what the venue counted for it, and this side's own
  // venue page and PIN when it confirms any of them; once the event has a
  // measurement.
  measure?: {
    code: string
    methods: MeasureMethod[]
    confirmedMethods?: MeasureMethod[]
    counts: Metrics
    venue?: { page: VenuePage; pin: string }
  }
  // Reviews open from the event's day; canWrite is false for the demo
  // accounts and when the other side has no listing to show it on.
  review: { open: boolean; canWrite: boolean; mine?: Review; theirs?: Review }
  // A side's request to call the sponsorship off, with why, and when the
  // other side agreed (then the agreement is only a record), and whether
  // this side may ask now: not after the event or from a demo account.
  cancel?: { by: ChatSide; reason: string; requestedAt: string; canceledAt?: string }
  cancelable: boolean
}

// A review one side of a sponsorship wrote about the other after the event.
export type Review = {
  authorName: string
  side: ChatSide
  eventName: string
  rating: number
  tags: string[]
  comment: string
  createdAt: string
  updatedAt?: string
}

// A listing's reviews in short.
export type ReviewSummary = { count: number; average: number; tags: { tag: string; count: number }[] }

// One line of the agreements list.
export type AgreementSummary = {
  id: string
  side: ChatSide
  partner: string
  eventName: string
  eventDate: string
  // Both sides called it off.
  canceled?: true
  confirmed: Partial<Record<ChatSide, string>>
  done: number
  total: number
  proof: number
}

// A student group's invitation to a shop (/invite/<code>).
export type ShopInvite = {
  code: string
  placeId: string
  placeUrl: string
  createdAt: string
  acceptedAt?: string
  brandId?: string
}

// The invitation page: who invited (their listing, or only a name and
// school before they wrote one) and whether the shop joined, as the brand
// looking ("you") or another.
export type InvitePageData = {
  invite: { code: string; placeUrl: string; createdAt: string; joined: "you" | "other" | null }
  group?: Partial<Match> & { name: string; category: string }
}

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

// The person who runs an account; partners see it only on a confirmed
// sponsorship's agreement.
export type AccountContact = { name: string; position: string; phone: string }

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  // Asked at sign-up; accounts from before have none.
  contact?: AccountContact
  // The account's own listing: brands in the brand catalog, student
  // groups in the group catalog.
  brandId?: string
  groupId?: string
  createdAt: string
}

export type Session = { token: string; account: Account }

// What the venue's staff count by the confirmation methods: samples or
// tastings, booth stamps, SNS posts, survey answers, purchases, goods given
// away, raffle entries, sign-ups or app installs, people who tried it.
export type VenueCounts = {
  samples: number
  stamps: number
  posts: number
  surveys: number
  purchases: number
  giveaways: number
  raffles: number
  signups: number
  experiences: number
}

// QR scans, coupons and store visits, then the venue's counts.
export type Metrics = { scans: number; coupons: number; visits: number } & VenueCounts

export type MetricKind = keyof Metrics

// How a sponsorship is confirmed at the event (협찬 확인 방식), and the side
// that confirms each method there, either or both (backend lib/methods.ts).
export type MethodKind =
  | "qr"
  | "coupon"
  | "visit"
  | "sampling"
  | "booth"
  | "sns"
  | "survey"
  | "purchase"
  | "giveaway"
  | "raffle"
  | "signup"
  | "experience"

export type MethodSide = ChatSide | "both"

export type MeasureMethod = { kind: MethodKind; side: MethodSide }

// One share's counts (a sponsor's, or a whole event's before any).
export type ShareCounts = Omit<Metrics, "scans">

// The two venue pages: the brand's (its store staff, /check-in/<code>/staff)
// and the student group's (/check-in/<code>/group).
export type VenuePage = "staff" | "group"

// A venue page once its PIN is right: the event and each share it confirms
// for, with the methods this side confirms there and the counts so far.
export type VenueShare = { id: string; brandName: string | null; store: string; kinds: MethodKind[]; counts: ShareCounts }

export type VenueSession = { eventName: string; eventDate: string; shares: VenueShare[] }

export type MetricEntry = {
  id: string
  kind: MetricKind
  at: string
  participant: string
  detail: string
}

// "취소됨": accepted, then called off by both sides from its agreement.
// "마감": a proposal that waited for an answer until its event ended.
export type RequestStatus = "검토 중" | "수락" | "거절" | "취소됨" | "마감"

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
  // When both sides called it off (취소).
  canceledAt?: string
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
  // When both sides called it off (취소).
  canceledAt?: string
}

// A proposal the account sent (a group's request, a brand's offer), as its
// inbox lists it beside the ones it received.
export type SentProposal = {
  id: string
  // The partner's listing, which DELETE /api/proposals/:matchId takes back.
  partnerId: string
  partnerName: string
  industry: Industry
  logo?: string
  school?: string
  // The sender's own event or campaign it is about.
  eventName: string
  eventDate?: string
  // What the group asked for, or what the brand offered.
  offer: string
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
  // What the venue confirmed for it by its confirmation methods.
  samples?: number
  stamps?: number
  posts?: number
  surveys?: number
  purchases?: number
  giveaways?: number
  raffles?: number
  signups?: number
  experiences?: number
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

// One figure two ways: real members' only, and with the demo data.
export type Figure = { real: number; total: number }

// The platform's figures for the operators (GET /api/admin/stats).
export type PlatformStats = Record<
  | "students"
  | "brands"
  | "newThisWeek"
  | "events"
  | "upcomingEvents"
  | "proposals"
  | "accepted"
  | "declined"
  | "sponsorships"
  | "scans"
  | "coupons"
  | "visits"
  | "messages"
  | "questionsWaiting",
  Figure
>

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
  // The student group's venue PIN; only for the group that owns the event.
  groupPin?: string
  // How the event is confirmed (as both sides confirmed it) before any
  // sponsor (each sponsor's below), and what the venue confirmed for the
  // whole event.
  methods: MeasureMethod[]
  venue: VenueCounts
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
  // How this sponsorship is confirmed (as both sides confirmed it).
  methods: MeasureMethod[]
  // Its store staff's PIN; only for the owner.
  staffPin?: string
} & VenueCounts

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
  | "성과"
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
  | "contact"
  | "email"
  | "invite"
  | "metric-log"
  | "goal"
  | "ask"
  | "calendar"
  | "install"
