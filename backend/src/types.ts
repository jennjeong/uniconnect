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
  // Match for the account browsing, worked out when the catalog is served
  // (lib/matchScore.ts), with the reasons that count most and each part
  // of it as a share of its best (0 to 1).
  score: number
  reasons?: string[]
  scoreParts?: { label: string; value: number }[]
  tags: string[]
  // Sponsorships with student groups this semester (brand catalog only).
  popularity?: number
  // Brand catalog only: the store, as its address and, once a map service
  // has placed it (lib/geocode.ts), its coordinates.
  location?: { address: string; lat?: number; lng?: number }
  // Brand catalog only: the shop on Kakao Map this brand is, once it joined
  // from a student group's invitation (ShopInvite). Kakao allows keeping a
  // place's ID, not what its search says about the place.
  kakaoPlaceId?: string
  // Its sponsorship reviews, worked out when the catalog is served: the
  // average stars (one decimal) and how many.
  rating?: number
  reviewCount?: number
  // Brand catalog only: its account's business registration was confirmed
  // (Account.business), worked out when the catalog is served.
  businessVerified?: true
  // Km from the account browsing (its campus or store) to this listing,
  // worked out when the catalog is served (lib/geo.ts); absent when either
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
  // Detail page: a short introduction, key facts (labels per side in
  // lib/validation.ts), SNS accounts and a portfolio.
  intro?: string
  facts?: { label: string; value: string }[]
  sns?: SnsAccount[]
  portfolio?: PortfolioItem[]
  // While set, its owner took it out of the lists for now (내 정보): the
  // other side's catalogs, matches, nearby shops and saved lists leave it out
  // (listedTo in lib/catalog.ts) and new proposals to it are refused, while
  // conversations, proposals and agreements under way carry on.
  pausedAt?: string
}

export type EventStatus = "매칭 중" | "집행 예정" | "측정 완료"

// A sponsorship package a student group offers brands on its event page:
// its name, what the brand gets, and the support it asks for.
export type SponsorPackage = { name: string; gives: string; asks: string }

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
  createdAt: string
  // When its owner was emailed that the day is near (lib/reminders.ts).
  remindedAt?: string
  // A student group's event page (routes/events.ts): where, what it is, up
  // to four photos (lib/photos.ts, under eventPhotos) and the packages it
  // offers brands.
  venue?: string
  intro?: string
  photos?: string[]
  packages?: SponsorPackage[]
}

// The person who runs an account. The phone shows only to the two sides of
// a confirmed sponsorship, on its agreement.
export type AccountContact = { name: string; position: string; phone: string }

// The kinds of notice email an account can turn off in 내 정보 (mailKinds in
// lib/validation.ts): proposals and their answers, news of confirmed
// sponsorships, messages, days that are near, and the weekly digest of
// partners who joined (lib/digest.ts).
export type MailKind = "proposals" | "sponsorships" | "messages" | "reminders" | "digest"

export type Account = {
  id: string
  role: Role
  name: string
  type: string
  school: string
  email: string
  // Asked at sign-up; accounts from before have none.
  contact?: AccountContact
  // The account's own listing: brands in the brand catalog (which also
  // receives the proposals student groups send), student groups in the
  // group catalog.
  brandId?: string
  groupId?: string
  passwordHash: string
  termsAgreedAt: string
  createdAt: string
  // When the operators stopped it over a report: it can't log in, gets no
  // email, and its listing shows to no one.
  suspendedAt?: string
  // A brand's business registration, once the National Tax Service confirmed
  // it (lib/business.ts): the number alone, so one business verifies one
  // account; the representative's name and opening date are not kept.
  business?: { number: string; verifiedAt: string }
  // The parts of the bell's notices the account has read (lib/notifications.ts
  // in the app), as it last sent them: only parts still shown, so the list
  // stays as short as the bell.
  readNotices?: string[]
  // The language the account last used the app in, for its emails; Korean
  // until the app says.
  language?: "ko" | "en"
  // The kinds of notice email the account turned off; codes and notices
  // about the account itself always go.
  mailOff?: MailKind[]
  // The Monday (Korea) the weekly digest last looked at this account.
  digestOn?: string
  // The secret link calendar apps subscribe to (routes/calendar.ts); kept
  // as made, so 내 정보 can show it again, and never in the account's data
  // the app gets.
  calendarFeed?: { token: string; createdAt: string }
  // Two-step login with an authenticator app (lib/totp.ts): the secret,
  // when it was turned on, the hashes of the recovery codes not yet used and
  // the last code's step, so each code works once. `pendingTwoFactor` is a
  // secret shown for setting up, not yet confirmed with a code.
  twoFactor?: { secret: string; enabledAt: string; recoveryHashes: string[]; usedStep?: number }
  pendingTwoFactor?: { secret: string; createdAt: number }
  // A login that passed the password and waits for its code: the hash of
  // the ticket the browser holds, until when, and wrong codes so far.
  loginTicket?: { hash: string; expiresAt: number; tries: number; userAgent?: string }
  // Co-admins who log in to this account with their own email and password
  // (routes/team.ts), and the invitations sent to others, by the hash of
  // the code each was emailed.
  members?: TeamMember[]
  memberInvites?: MemberInvite[]
  // Kakao or Naver accounts linked from 내 정보, by the provider's member
  // number, to log in with (routes/social.ts).
  social?: Partial<Record<SocialProvider, { id: string; linkedAt: string }>>
}

export type SocialProvider = "kakao" | "naver"

export type TeamMember = { id: string; name: string; email: string; passwordHash: string; addedAt: string }
export type MemberInvite = { id: string; name: string; email: string; codeHash: string; invitedAt: string; expiresAt: number; tries: number }

export type PublicAccount = Omit<
  Account,
  "passwordHash" | "termsAgreedAt" | "calendarFeed" | "twoFactor" | "pendingTwoFactor" | "loginTicket" | "members" | "memberInvites" | "social"
> & {
  twoFactorOn?: true
  // The providers linked to log in with, never their member numbers.
  socialLinks?: SocialProvider[]
  // Set when a co-admin is the one logged in (not the account's owner).
  asMember?: { id: string; name: string; email: string }
}

export type Session = {
  // sha256 of the token the browser holds, so the data file alone cannot
  // log anyone in.
  tokenHash: string
  accountId: string
  expiresAt: number
  // For the device list: the browser and system (lib/devices.ts), and when
  // it logged in and was last used (updated at most hourly).
  device?: string
  createdAt?: number
  lastUsedAt?: number
  // A co-admin's login to the account (Account.members); the owner's has none.
  memberId?: string
}

export type EmailCode = {
  email: string
  role: Role
  code: string
  expiresAt: number
  attempts: number
  // When this run of codes began; wrong guesses carry over within it.
  firstSentAt?: number
  // A code for resetting a password, or for moving an account to a new login
  // email ("change", with the account asking), rather than for signing up.
  purpose?: "reset" | "change"
  accountId?: string
  verificationToken?: string
  verifiedUntil?: number
}

// What the venue's staff count by the confirmation methods (lib/methods.ts):
// samples or tastings handed out, booth visits stamped, SNS posts, survey
// answers, purchases on the spot, goods given away, raffle entries, sign-ups
// or app installs, and people who tried the brand's experience.
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

// The event's counts: QR scans, coupons and store visits, then the venue's.
export type Metrics = { scans: number; coupons: number; visits: number } & VenueCounts

export type MetricKind = keyof Metrics

// How a sponsorship is confirmed at the event (협찬 확인 방식, lib/methods.ts):
// the check-in QR, its coupon and the store's visits, then what the venue's
// staff count (VenueCounts). Each is confirmed by one side or both, from
// their own venue page with their own PIN; store visits always by the
// brand's store.
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

// One recorded QR scan, coupon, store visit or venue confirmation.
export type MetricEntry = {
  id: string
  kind: MetricKind
  at: string
  participant: string
  detail: string
}

// "취소됨": accepted, then called off by both sides from its agreement.
// "마감" is never stored: a proposal waiting for an answer shows it once
// its event has ended (lib/proposals.ts).
export type RequestStatus = "검토 중" | "수락" | "거절" | "취소됨" | "마감"

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
  // The brand's board post it applies to, when it came from one.
  postId?: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
  // When both sides called the sponsorship off (취소).
  canceledAt?: string
}

// A sponsorship proposal a brand sent to a student group.
export type SponsorOffer = {
  id: string
  // The group's listing it was sent to.
  groupId: string
  // Brand account that sent it; seeded examples have none.
  fromAccountId?: string
  // That account's campaign the offer is about; accepting it confirms the campaign.
  campaignId?: string
  // The brand's listing, when it has one.
  brandId?: string
  brandName: string
  industry: Industry
  campaignName: string
  // "YYYY-MM-DD", or "" while the brand has no campaign scheduled.
  campaignDate: string
  // What the brand offers.
  offer: string
  message: string
  // The group's board post it applies to, when it came from one.
  postId?: string
  status: RequestStatus
  createdAt: string
  respondedAt?: string
  // When both sides called the sponsorship off (취소).
  canceledAt?: string
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
  // The student event it sponsored, whose measurement updates the counts.
  eventId?: string
  // ROAS goal in percent, set before the sponsorship.
  targetRoas: number
  // When the brand was emailed that the day is near (lib/reminders.ts).
  remindedAt?: string
}

// What a student group sets before an event to measure it against.
export type MeasurementGoals = {
  expectedAudience: number
  // Won a participant spends at the sponsor's store, for estimated sales.
  averageSpend: number
  // Reach beyond the venue (SNS and the like), added to the QR scans.
  snsReach: number
  // The sponsorship's value by kind, in won.
  valueBreakdown: { type: string; value: number }[]
  targets: Report["targets"]
  // The sponsor's coupon participants get on the check-in page.
  coupon: { store: string; title: string }
}

// A coupon participants take at the check-in page, by its number.
// `coupon` is true on passes from before numbers were issued.
export type PassCoupon = { coupon?: string | true; visit?: true }

// One brand sponsoring a student event, on that event's measurement: its own
// coupon, the PIN its store staff confirm visits with, its counts and the
// value it gave, so its analytics hold only its share.
export type EventSponsor = {
  // The brand's sponsorship (Sponsorship.id).
  id: string
  brandName: string
  coupon: { store: string; title: string }
  // Won this sponsor gave. Unset splits the event's value evenly; with one
  // sponsor it is always the whole value.
  value?: number
  staffPin: string
  metrics: { coupons: number; visits: number } & VenueCounts
  // How this sponsorship is confirmed, as its e-contract sets it, and as
  // both sides last confirmed it, which is what counts (the QR, coupon and
  // store visits until then).
  methods?: MeasureMethod[]
  confirmedMethods?: MeasureMethod[]
}

// One event's live measurement: its counts, the scans by hour, the latest
// records and the goals. `code` is in the event's check-in address.
export type Measurement = {
  eventId: string
  accountId: string
  code: string
  metrics: Metrics
  // QR scans by day and hour in Korea.
  hourlyScans: { date: string; hour: number; scans: number }[]
  // Most recent records, oldest first.
  log: MetricEntry[]
  goals: MeasurementGoals
  // 4 digits the store staff enter to confirm a visit, while the event has
  // no sponsors; each sponsor has its own after that.
  staffPin: string
  // 4 digits the student group's staff enter on its own venue page
  // (/check-in/<code>/group) to confirm what its methods assign to it.
  groupPin: string
  // How the event is confirmed while it has no sponsors (a brand's campaign,
  // set on its e-contract with the group), as set and as both sides last
  // confirmed it; each sponsor has its own after.
  methods?: MeasureMethod[]
  confirmedMethods?: MeasureMethod[]
  // `metrics` counts the whole event. Once brands sponsor it, participants
  // take each sponsor's coupon instead of the event's, and the sponsor's
  // own counts grow with the totals.
  sponsors: EventSponsor[]
  // One pass per scan, so each participant gets each coupon once and each
  // visit once: the event's coupon on the pass itself, sponsors' coupons
  // under their ids. The number is what the store staff enter.
  passes: Record<string, PassCoupon & { sponsors?: Record<string, PassCoupon> }>
}

// Performance report of one event, worked out from its measurement and
// the goals set before it.
export type Report = {
  eventId: string
  // In the event's check-in address.
  code: string
  eventName: string
  eventDate: string
  // Last day of an event over several days.
  eventEndDate?: string
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
  hourlyScans: Measurement["hourlyScans"]
  valueBreakdown: { type: string; value: number }[]
  // Inputs the figures above come from.
  averageSpend: number
  snsReach: number
  coupon: MeasurementGoals["coupon"]
  // Only for the group that owns the event.
  staffPin?: string
  // The student group's venue PIN, only for the group that owns the event.
  groupPin?: string
  // How the event is confirmed (as both sides confirmed it), before any
  // sponsor (each sponsor's below).
  methods: MeasureMethod[]
  // What the venue's staff confirmed so far, for the whole event.
  venue: VenueCounts
  // The event's sponsors with their own share, once brands sponsor it.
  sponsors?: SponsorReport[]
}

// One sponsor's share of an event in its report.
export type SponsorReport = {
  id: string
  brandName: string
  coupon: EventSponsor["coupon"]
  // Won this sponsor gave (the even split when the group has set none).
  value: number
  coupons: number
  visits: number
  roas: number
  // How this sponsorship is confirmed (as both sides confirmed it).
  methods: MeasureMethod[]
  // Only for the group that owns the event.
  staffPin?: string
} & VenueCounts

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
  // A photo or PDF sent with it; gone once the message is deleted.
  attachment?: ChatAttachment
}

// A file sent in a conversation (routes/conversations.ts): a photo resized
// in the browser or a PDF, kept with lib/photos.ts under chatFiles(id), by
// the name it is kept as and the name it was sent with.
export type ChatAttachment = { file: string; name: string; type: "image" | "pdf"; size: number }

// Messages between a student group and a brand, by their listing ids.
export type Conversation = {
  id: string
  groupId: string
  brandId: string
  messages: ChatMessage[]
  // When each side last read the conversation.
  readAt: Partial<Record<ChatSide, string>>
}

// A question an account sent the operators from the FAQ page, and their
// answer once given (through the admin routes).
export type Inquiry = {
  id: string
  accountId: string
  category: string
  question: string
  createdAt: string
  answer?: string
  answeredAt?: string
  // When the asker saw the answer as it stands; a new answer is unread again.
  answerReadAt?: string
}

// One thing a side of an accepted proposal promised, and the proof that it
// was done: links (an SNS post, say) and photos kept on disk beside the
// data file (uploads/<agreement id>/<photo id>).
export type AgreementItem = {
  id: string
  // Who does it.
  side: ChatSide
  label: string
  doneAt?: string
  links: string[]
  photos: string[]
}

// The terms of an accepted proposal (임시 전자 계약서), with the proposal's id:
// what each side does, when each side confirmed the terms as they stand,
// and the proof as it is done. Made the first time either side opens it.
export type Agreement = {
  id: string
  // A student group's proposal answered by the brand, or a brand's offer.
  kind: "request" | "offer"
  items: AgreementItem[]
  // Changing the items clears both.
  confirmed: Partial<Record<ChatSide, string>>
  // One side's request to call the sponsorship off, with why, and when the
  // other side agreed to it (its proposal is 취소 from then on).
  cancel?: { by: ChatSide; reason: string; requestedAt: string; canceledAt?: string }
  createdAt: string
  updatedAt: string
}

// One side's review of the other after a sponsorship's event: stars, up to
// three of the listed tags (validation.ts reviewTags) and a short comment,
// shown on the reviewed listing's detail page. One per side per accepted
// proposal; seeded ones have no proposal or author account.
export type Review = {
  // `${proposalId}:${side}`.
  id: string
  proposalId: string
  // The side writing it.
  side: ChatSide
  // The listing it is about.
  aboutId: string
  authorAccountId?: string
  authorName: string
  eventName: string
  rating: number
  tags: string[]
  comment: string
  createdAt: string
  updatedAt?: string
  // When the operators took it down over a report.
  hiddenAt?: string
  // The reviewed side's answer, one per review, written on the agreement and
  // shown under the review; hiddenAt once the operators took it down.
  reply?: { text: string; createdAt: string; updatedAt?: string; hiddenAt?: string }
}

// What the operators did about a report: nothing, took the review or the
// reply to it down, or stopped the account.
export type ReportAction = "dismiss" | "hide-review" | "hide-reply" | "suspend"

// A member's report of another account, one of the messages it sent or its
// review, for the operators (/admin), and what they did about it.
export type AbuseReport = {
  id: string
  reporterId: string
  // The account it is about.
  accountId: string
  target:
    | { kind: "account" }
    | { kind: "message"; conversationId: string; messageId: string }
    | { kind: "review"; reviewId: string }
    | { kind: "reply"; reviewId: string }
  // One of reportReasons (lib/validation.ts), and in the reporter's words.
  reason: string
  detail: string
  // The reported text as it was, so it reads the same after an edit.
  excerpt?: string
  createdAt: string
  resolution?: { action: ReportAction; at: string }
}

// A student group's invitation to a shop it found on 추천 매칭's 가까운 순,
// sent as a link (/invite/<code>). Kakao allows keeping only a place's ID
// and its Kakao Map page, so that is all it holds about the shop.
export type ShopInvite = {
  code: string
  // The student group account that invited.
  accountId: string
  placeId: string
  placeUrl: string
  createdAt: string
  // Once a brand account took it: when, and that brand's listing.
  acceptedAt?: string
  brandId?: string
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
  inquiries: Inquiry[]
  // Proposals from student groups to brands, answered by the brand.
  requests: SponsorRequest[]
  // Proposals brands sent to student groups.
  offers: SponsorOffer[]
  // Finished sponsorships, keyed by brand account id.
  sponsorships: Record<string, Sponsorship[]>
  // Keyed by account id.
  events: Record<string, EventItem[]>
  proposals: Record<string, string[]>
  // Accounts whose events are shown to visitors who are not logged in.
  demoAccountIds: Record<Role, string>
  // One per event that has been measured or opened for measuring.
  measurements: Measurement[]
  // Shops student groups invited from 가까운 순.
  invites: ShopInvite[]
  // The terms and proof of accepted proposals, by the proposal's id.
  agreements: Agreement[]
  // Members' reports for the operators.
  reports: AbuseReport[]
  // The accounts each account blocked, by account id: the two no longer see
  // each other's listings, proposals or conversations.
  blocks: Record<string, string[]>
  reviews: Review[]
  // The listings each account saved (찜), newest first, by account id.
  saved: Record<string, string[]>
  // The recruitment board (routes/board.ts).
  posts: BoardPost[]
  // Logins with Kakao or Naver under way (routes/social.ts): each started
  // flow's state, and the one-time code that hands a finished login to the
  // page, both by hash and for minutes only.
  oauth?: {
    states: { hash: string; provider: SocialProvider; intent: "login" | "link"; accountId?: string; expiresAt: number }[]
    handoffs: { hash: string; accountId: string; userAgent?: string; expiresAt: number }[]
  }
}

// A public post on the recruitment board (routes/board.ts): a brand looking
// for events to sponsor, or a student group looking for sponsors for one of
// its events. The other side applies by proposing (POST /api/proposals with
// postId), and the poster answers in its inbox.
export type BoardPost = {
  id: string
  accountId: string
  // The poster's listing, which the post shows as.
  listingId: string
  title: string
  body: string
  // Kinds of sponsorship a brand offers or a group wants (sponsorTypes).
  types: string[]
  // A group's post is about one of its events.
  eventId?: string
  // The last day to apply, "YYYY-MM-DD".
  deadline: string
  // When its poster closed it before the deadline.
  closedAt?: string
  createdAt: string
  updatedAt?: string
}
