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
  // Brand catalog only: its business registration was confirmed.
  businessVerified?: true
  // A brand on Pro (backend lib/plan.ts).
  pro?: true
  // Km from the account browsing (its campus or store); absent when either
  // place is unknown.
  distanceKm?: number
  // Which way, in metres east and north of the account browsing, for the
  // catalog map; served with distanceKm.
  mapOffset?: { east: number; north: number }
  // Student group catalog only: school, next event (its id for its page) and
  // its expected audience.
  school?: string
  eventId?: string
  eventName?: string
  eventDate?: string
  audience?: number
  // Detail page: a short introduction, key facts, SNS and a portfolio.
  intro?: string
  facts?: { label: string; value: string }[]
  sns?: SnsAccount[]
  portfolio?: PortfolioItem[]
  // The owner's own listing only: taken out of the lists for now (내 정보).
  pausedAt?: string
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
  // accounts and when the other side has no listing to show it on; canReply
  // says this side may answer the other's review of it.
  review: { open: boolean; canWrite: boolean; canReply: boolean; mine?: Review; theirs?: Review }
  // A side's request to call the sponsorship off, with why, and when the
  // other side agreed (then the agreement is only a record), and whether
  // this side may ask now: not after the event or from a demo account.
  cancel?: { by: ChatSide; reason: string; requestedAt: string; canceledAt?: string }
  cancelable: boolean
  // What the sponsorship is worth, cash and in-kind, once written.
  value?: { cash: number; inKind: number }
  // The platform fee the brand pays to confirm (backend lib/fees.ts): none
  // when exempt (the demo accounts, sponsorships from before fees), else
  // its share of the value, what was paid and what is still due.
  fee: { rate: number; exempt: boolean; amount: number; paid: number; due: number; needsValue: boolean }
}

// What a brand pays the platform (backend lib/billing.ts).
export type PaymentKind = "fee" | "report" | "pro"

export type Payment = {
  id: string
  accountName: string
  kind: PaymentKind
  targetId: string
  orderName: string
  amount: number
  status: "pending" | "paid" | "cancelled"
  method?: "card" | "transfer"
  receiptUrl?: string
  requestedAt: string
  transferRequestedAt?: string
  paidAt?: string
  cancelledAt?: string
  cancelReason?: string
  periodEnd?: string
  openedAt?: string
}

// Prices, whether card payment is on, and the account's payments.
export type BillingInfo = {
  prices: { feeRate: number; report: number; pro: number; proDays: number }
  card: { clientKey: string } | null
  // Toss test keys: no money moves, and the demo accounts may pay to show it.
  testMode: boolean
  canPay: boolean
  payments: Payment[]
  // The brand's plan (backend lib/pro.ts): Pro until a Korean day, and this
  // month's proposals against the free plan's limit.
  plan: { pro: boolean; until: string | null; offersThisMonth: number; freeOffers: number; partnerRequestsLeft: number }
}

// An order to pay, with what the payment window needs.
export type PaymentOrder = { order: Payment; customerKey: string; email: string }

// A payment as the operators see it.
export type AdminPayment = Payment & { accountId: string; card: boolean }

// A review one side of a sponsorship wrote about the other after the event.
export type Review = {
  // Stands for the review without giving its proposal away, to report it.
  key: string
  authorName: string
  side: ChatSide
  eventName: string
  rating: number
  tags: string[]
  comment: string
  createdAt: string
  updatedAt?: string
  // Taken down by the operators; only its author still sees it.
  hidden?: true
  // The reviewed side's answer, under the review; once the operators took it
  // down, only that it was (no text).
  reply?: { text?: string; createdAt: string; updatedAt?: string; hidden?: true }
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
  // A student group's event page (pages/EventDetailPage.tsx): where, what it
  // is, its photos' names and the packages it offers brands.
  venue?: string
  intro?: string
  photos?: string[]
  packages?: SponsorPackage[]
}

// A sponsorship package on a group's event page: its name, what the brand
// gets, and the support the group asks for.
export type SponsorPackage = { name: string; gives: string; asks: string }

// A recruitment board post as the API gives it (backend routes/board.ts):
// the post, its poster's side and listing, a group's event, whether it still
// takes applications and whether the one looking posted it; the viewer's own
// application, and to its poster the applications that came in.
export type BoardPost = {
  id: string
  listingId: string
  title: string
  body: string
  types: string[]
  eventId?: string
  // The last day to apply, "YYYY-MM-DD".
  deadline: string
  closedAt?: string
  createdAt: string
  updatedAt?: string
  role: Role
  poster: Pick<Match, "id" | "name" | "category" | "industry" | "logo" | "school">
  event?: { id: string; name: string; date: string; endDate?: string; people: string }
  open: boolean
  own: boolean
  applied?: RequestStatus
  applications?: { id: string; name: string; about: string; date: string; status: RequestStatus }[]
}

// A post as written or edited: a group's names one of its events.
export type PostDraft = { title: string; body: string; types: string[]; deadline: string; eventId?: string }

// An event page as the API gives it: the event, the group behind it, and
// whether the one looking owns it.
export type EventPage = {
  event: EventItem
  group: Pick<Match, "id" | "name" | "school" | "category" | "industry" | "logo">
  own: boolean
}

// The person who runs an account; partners see it only on a confirmed
// sponsorship's agreement.
export type AccountContact = { name: string; position: string; phone: string }

export type Account = {
  id: string
  // Two-step login with an authenticator app is on.
  twoFactorOn?: true
  // Set when a co-admin is the one logged in (not the account's owner).
  asMember?: { id: string; name: string; email: string }
  // Kakao or Naver accounts linked to log in with.
  socialLinks?: SocialProvider[]
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
  // The parts of the bell's notices the account has read (lib/notifications.ts).
  readNotices?: string[]
  // The language its emails are in, and the kinds of notice email it turned off.
  language?: "ko" | "en"
  mailOff?: MailKind[]
}

// The kinds of notice email (data/mail.ts).
export type MailKind = "proposals" | "sponsorships" | "messages" | "reminders" | "digest"

// Whether brands can verify their business here (the server has the key),
// and this brand's confirmed registration.
export type BusinessStatus = { ready: boolean; business: { number: string; verifiedAt: string } | null }

export type Session = { token: string; account: Account }

// A password that was right for an account with two-step login on: the
// ticket to send back with the app's code (components/CodeStep.tsx).
export type CodeTicket = { twoFactor: true; ticket: string }

// The providers one can log in with once linked (routes/social.ts).
export type SocialProvider = "kakao" | "naver"

// One device logged in to the account (내 정보's 로그인한 기기).
export type DeviceSession = {
  id: string
  device: string
  createdAt?: string
  lastUsedAt?: string
  current: boolean
  // A co-admin's login, by its name, in the owner's list.
  member?: string
}

// The people running one account (내 정보's 함께 관리하는 사람): the owner,
// co-admins and invitations still open; `you` is "owner" or a member's id.
export type Team = {
  owner: { name: string; email: string }
  members: { id: string; name: string; email: string; addedAt: string }[]
  invites: { id: string; name: string; email: string; invitedAt: string; expiresAt: string }[]
  you: string
}

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
  // The group's event it is about, whose page it links to.
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
  // The note that went with it.
  message?: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
}

// One finished sponsorship of a brand, for its analytics.
export type Sponsorship = {
  id: string
  // The student event it sponsored, when measured; its detailed report is
  // at /insights/<id>, readable, to buy, not yet (before the event's day) or
  // none (backend lib/premiumReport.ts reportState).
  eventId?: string
  report?: "open" | "locked" | "soon" | "none"
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
  // A photo or PDF sent as the message; gone once it is deleted.
  attachment?: ChatAttachment
}

// A file sent in a conversation: the name it is kept by, the name it was
// sent with, its kind and its size in bytes.
export type ChatAttachment = { file: string; name: string; type: "image" | "pdf"; size: number }

// A conversation with a brand (for student groups) or a group (for brands).
// A question this account sent the operators, with their answer once given.
export type Inquiry = {
  id: string
  category: string
  question: string
  createdAt: string
  answer?: string
  answeredAt?: string
  // When the asker saw the answer as it stands.
  answerReadAt?: string
}

// A question as the operators see it, with who sent it.
export type AdminInquiry = Inquiry & {
  from: { name: string; role: Role; email: string } | null
}

// What the operators can do about a report.
export type ReportAction = "dismiss" | "hide-review" | "hide-reply" | "suspend"

// A member's report as the operators see it: who reported whom over what,
// with the reported text as it was, and what was done.
export type AdminReport = {
  id: string
  target:
    | { kind: "account" }
    | { kind: "message"; conversationId: string; messageId: string }
    | { kind: "review"; reviewId: string }
    | { kind: "reply"; reviewId: string }
  reason: string
  detail: string
  excerpt?: string
  createdAt: string
  resolution?: { action: ReportAction; at: string }
  reporter: { id: string; name: string; role: Role; email: string } | null
  about: { id: string; name: string; role: Role; email: string } | null
}

// An account the operators suspended.
export type SuspendedAccount = { id: string; name: string; role: Role; email: string; suspendedAt: string }

// A request the server failed or an error a browser caught, as the
// operators read it (backend lib/errorLog.ts).
export type ErrorEntry = {
  id: string
  at: string
  source: "server" | "browser"
  message: string
  where: string
  path: string
  stack?: string
}

// An account this one blocked, by its listing.
export type BlockedListing = { listingId: string; name: string }

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
  lastMessage: { text: string; at: string; mine: boolean; deleted?: boolean; attachment?: ChatAttachment["type"] } | null
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
  | "propose"
  | "post"
  | "safety"
  | "business"
  | "two-factor"
  | "devices"
  | "team"
  | "join"
  | "council-link"
  | "payment"
  | "payments"

// What a student council sees of one club that linked to it (backend
// lib/council.ts): its coming events, open proposals, sponsorships and
// results so far, never its messages, contacts or agreements.
export type CouncilClub = {
  id: string
  name: string
  type: string
  school: string
  listingId?: string
  industry?: Industry
  logo?: string
  linkedAt: string
  events: { id: string; name: string; date: string; endDate?: string; people?: string }[]
  eventCount: number
  openProposals: number
  sponsorships: number
  results: { scans: number; coupons: number; visits: number }
}

// A council a club linked to (내 정보's 학생회 연결).
export type CouncilLink = { id: string; name: string; type: string; school: string; linkedAt: string }

// A figure among the other events measured on uniconnect: their median, how
// many there were, and the share of them this one beat. None below three.
export type Benchmark = { median: number; count: number; beats: number } | null

export type ScoreKey = "reach" | "scans" | "coupons" | "visits" | "qrRate" | "visitRate" | "roas"

// 상세 성과 리포트 (backend lib/premiumReport.ts): one sponsorship's detailed
// report, worked out live until its coupons' days are over.
export type PremiumReport = {
  number: string
  issuedAt: string
  final: boolean
  finalOn: string
  sponsorship: { id: string; brandName: string; groupName: string; eventName: string }
  event: {
    date: string
    endDate?: string
    venue?: string
    people?: string
    window: { start: string; end: string; visitsEnd: string }
  }
  spend: number
  averageSpend: number
  snsReach: number
  sales: number
  grade: "S" | "A" | "B" | "C" | "D"
  achievement: number
  scorecard: { key: ScoreKey; target: number; actual: number; achievement: number | null }[]
  funnel: { key: "audience" | "scans" | "coupons" | "visits"; count: number; rate: number | null; benchmark: Benchmark }[]
  costs: {
    perThousandReach: number | null
    perScan: number | null
    perCoupon: number | null
    perVisit: number | null
    perVisitBenchmark: Benchmark
    roasBenchmark: Benchmark
  }
  time: {
    hourly: { date: string; hour: number; scans: number }[]
    peak: { date: string; hour: number; scans: number } | null
    daily: { date: string; scans: number; coupons: number; visits: number }[]
    lag: { days: number[]; average: number | null; sample: number }
    recordsKept: number
  }
  effect: {
    before: number
    during: number
    days: number
    lift: number
    extraVisitors: number
    extraSales: number
    incrementalRoas: number
    attributedShare: number | null
  } | null
  fulfillment: { items: { side: ChatSide; label: string; done: boolean; proof: number }[]; done: number; proof: number }
  venue: VenueCounts
  methods: MethodKind[]
  reviews: { side: ChatSide; rating: number; tags: string[]; comment: string }[]
  advice: { code: string; values?: Record<string, number | string> }[]
  next: { id: string; name: string; school: string; category: string; score: number; event?: { name: string; date: string } }[]
  benchmarkCount: number
  groupName: string
  overview: {
    school: string
    category: string
    expectedAudience: number
    valueBreakdown: { type: string; value: number }[]
    coupon: { store: string; title: string }
    targets: Record<ScoreKey, number>
    agreedValue: { cash: number; inKind: number } | null
  }
  audience: {
    responses: number
    responseRate: number
    grade: Record<string, number>
    field: Record<string, number>
    visited: Record<string, number>
    firstTimeShare: number
  } | null
  visitsAnalysis: { redemption: number; sameDayShare: number | null; weekdays: number[]; newCustomers: number | null }
  roi: { breakEvenVisits: number | null; sensitivity: { factor: number; spendPerVisit: number; roas: number }[] }
  partner: { otherEvents: number; averageScanRate: number | null; rating: number | null; reviewCount: number }
  history: { count: number; averageRoas: number | null; averagePerVisit: number | null; rank: number | null }
}

// The report as its page loads it: a preview with the price until bought.
export type InsightAnswer =
  | {
      locked: true
      price: number
      open: boolean
      sponsorship: { id: string; groupName: string; eventName: string; date: string }
    }
  | { locked: false; report: PremiumReport; editable: boolean; shared: boolean; shareToken?: string }

// 캠퍼스 포트폴리오 (backend lib/portfolio.ts): a Campus Partners brand's
// sponsorships together, grouped three ways.
export type PortfolioGroup = { key: string; count: number; spend: number; visits: number; coupons: number; sales: number; roas: number }

export type PortfolioRow = {
  id: string
  eventName: string
  groupName: string
  date: string
  school: string
  category: string
  spend: number
  coupons: number
  visits: number
  sales: number
  roas: number
}

export type Portfolio = {
  count: number
  totals: { spend: number; visits: number; coupons: number; sales: number; roas: number; costPerVisit: number | null; salesPerVisit: number | null }
  bySchool: PortfolioGroup[]
  byMonth: PortfolioGroup[]
  byCategory: PortfolioGroup[]
  best: PortfolioRow | null
  weakest: PortfolioRow | null
  rows: PortfolioRow[]
}

// The operators' console (backend lib/console.ts).
export type AdminOverview = {
  stats: PlatformStats
  weekly: { week: string; signups: number; proposals: number; accepted: number }[]
  revenue: { total: number; thisMonth: number; byKind: Record<PaymentKind, number>; partners: number }
  attention: { inquiries: number; reports: number; transfers: number; suspended: number }
}

export type AdminMember = {
  id: string
  name: string
  role: Role
  type: string
  email: string
  school: string
  createdAt: string
  lastSeen?: string
  suspendedAt?: string
  demo: boolean
  partnersUntil: string | null
  listed: boolean
  paused: boolean
  events: number
  sent: number
  sponsorships: number
  business: boolean
}

export type AdminProposalRow = {
  id: string
  kind: "request" | "offer"
  from: string
  to: string
  event: string
  date: string
  status: string
  createdAt: string
  example: boolean
  confirmed: boolean
}

export type AdminMemberDetail = AdminMember & {
  contact?: AccountContact
  eventList: { id: string; name: string; date: string; endDate?: string; people?: string }[]
  sentList: { id: string; partner: string; event: string; status: string; createdAt: string }[]
  receivedList: { id: string; partner: string; event: string; status: string; createdAt: string }[]
  payments: { id: string; orderName: string; amount: number; status: Payment["status"]; at: string }[]
  inquiries: number
  reportsAbout: number
  sessions: number
  // The operators' own note on the member.
  note: { text: string; at: string } | null
}

// What an operator did in the console, with its target's name as it is now.
export type AdminLogRow = {
  id: string
  at: string
  action:
    | "payment-paid"
    | "payment-cancelled"
    | "report-resolved"
    | "account-suspended"
    | "account-unsuspended"
    | "inquiry-answered"
    | "note-saved"
    | "announcement-posted"
    | "announcement-ended"
  target: { kind: "account" | "payment" | "inquiry" | "report" | "announcement"; id: string }
  detail?: string
  label: string | null
}

// Which services the API is set up for, as yes or no.
export type AdminHealth = {
  storage: "postgres" | "file"
  payments: "off" | "test" | "live"
  checks: { key: string; on: boolean }[]
  vercel: boolean
  region: string | null
  commit: string | null
  data: { accounts: number; sessions: number; payments: number; logEntries: number }
}

// A notice the operators show across the top of the site.
export type SiteNotice = { id: string; text: string; tone: "info" | "warning" }

export type AdminAnnouncement = SiteNotice & {
  audience: "all" | Role
  until?: string
  createdAt: string
  endedAt?: string
  live: boolean
}
