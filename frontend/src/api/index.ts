import type {
  Account,
  AccountContact,
  AdminAgreementRow,
  AdminAnnouncement,
  AdminEventRow,
  AdminHealth,
  AdminInquiry,
  AdminInsights,
  AdminInvites,
  AdminLive,
  AdminLogRow,
  AdminMember,
  AdminMemberDetail,
  AdminOverview,
  AdminPayment,
  AdminPostRow,
  AdminProposalDetail,
  AdminProposalRow,
  AdminReport,
  AdminReviewRow,
  AdminStaleProposal,
  AdminSystem,
  Agreement,
  AgreementSummary,
  BillingInfo,
  BlockedListing,
  BoardPost,
  BusinessStatus,
  CheckInInfo,
  CodeTicket,
  Conversation,
  CouncilClub,
  CouncilLink,
  DeviceSession,
  ErrorEntry,
  EventItem,
  EventMeasurement,
  EventPage,
  FaqTopicKey,
  Inquiry,
  InsightAnswer,
  InvitePageData,
  MailKind,
  EventCase,
  OwnLedger,
  PublicLedger,
  ExploreEvent,
  ProposalTemplate,
  Match,
  MeasureMethod,
  MethodKind,
  MetricEntry,
  MetricKind,
  Metrics,
  NearbyPlaces,
  Payment,
  PaymentKind,
  PaymentOrder,
  PlatformStats,
  Portfolio,
  PostDraft,
  PremiumReport,
  ProfileDraft,
  Report,
  ReportAction,
  RequestStatus,
  Review,
  ReviewSummary,
  Role,
  SentProposal,
  Session,
  ShopInvite,
  SiteFaq,
  SiteNotice,
  SiteState,
  SocialProvider,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
  SuspendedAccount,
  Team,
  VenuePage,
  VenueSession,
  VenueShare,
} from "../types"
import { request, requestBlob } from "./client"

export { ApiError, errorMessage, getToken, setToken } from "./client"

export type SignupPayload = {
  role: Role
  name: string
  type: string
  school: string
  email: string
  password: string
  verificationToken: string
  agreedToTerms: boolean
  over14: boolean
  // The invitation code the visitor arrived with (친구 초대).
  referral?: string
  contact: AccountContact
}

export type EventDraft = Pick<
  EventItem,
  | "name"
  | "people"
  | "date"
  | "endDate"
  | "types"
  | "typeNote"
  | "budget"
  | "venue"
  | "intro"
  | "packages"
  | "kind"
  | "startTime"
  | "endTime"
  | "makeup"
> & {
  // 홍보 · 배포 계획 as chosen, and the agreement to carry it out.
  promo?: { spots: string[]; handouts: string[]; posts: string[]; agreedAt?: string }
  promoAgreed?: boolean
}

// Proposals the account sent, with each brand's answer so far.
export type ProposalState = {
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  // Sponsorships confirmed either way round (sent and accepted, or received
  // and accepted).
  confirmed: number
  // What the account sent, newest first, for its inbox.
  sent: SentProposal[]
}

// One function per backend endpoint (see backend/src/routes).
export const api = {
  me: () => request<{ account: Account }>("/auth/me"),
  login: (body: { role: Role; email: string; password: string }) =>
    request<Session | CodeTicket>("/auth/login", { method: "POST", body }),
  // The second step with two-step login on: the app's code or a recovery code.
  loginCode: (body: { email: string; ticket: string; code: string }) =>
    request<Session & { recoveryLeft?: number }>("/auth/login/code", { method: "POST", body }),
  twoFactorSetup: (password: string) =>
    request<{ secret: string; url: string }>("/auth/two-factor/setup", { method: "POST", body: { password } }),
  twoFactorEnable: (code: string) =>
    request<{ account: Account; recoveryCodes: string[] }>("/auth/two-factor/enable", { method: "POST", body: { code } }),
  twoFactorDisable: (body: { password: string; code: string }) =>
    request<{ account: Account }>("/auth/two-factor/disable", { method: "POST", body }),
  sessions: () => request<{ sessions: DeviceSession[] }>("/auth/sessions"),
  endSession: (id: string) => request<void>(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  endOtherSessions: () => request<void>("/auth/sessions", { method: "DELETE" }),
  // Kakao and Naver: the providers offered, the address to send the browser
  // to, the login the server handed back in a cookie, and unlinking.
  socialProviders: () => request<{ providers: SocialProvider[] }>("/auth/social"),
  socialStart: (provider: SocialProvider, intent: "login" | "link") =>
    request<{ url: string }>(`/auth/social/${provider}/start`, { method: "POST", body: { intent } }),
  socialComplete: () =>
    request<Session | (CodeTicket & { email: string })>("/auth/social/complete", { method: "POST" }),
  socialUnlink: (provider: SocialProvider) =>
    request<{ account: Account }>(`/auth/social/${provider}`, { method: "DELETE" }),
  // A student council's clubs and code, and a club's links to councils.
  councilClubs: () => request<{ code: string; clubs: CouncilClub[] }>("/council/clubs"),
  newCouncilCode: () => request<{ code: string }>("/council/code", { method: "POST" }),
  removeClub: (id: string) => request<void>(`/council/clubs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  councilLinks: () => request<{ councils: CouncilLink[] }>("/council/links"),
  linkCouncil: (code: string) => request<{ councils: CouncilLink[] }>("/council/links", { method: "POST", body: { code } }),
  unlinkCouncil: (id: string) =>
    request<{ councils: CouncilLink[] }>(`/council/links/${encodeURIComponent(id)}`, { method: "DELETE" }),
  team: () => request<{ team: Team }>("/team"),
  inviteMember: (body: { name: string; email: string }) =>
    request<{ team: Team; devCode?: string }>("/team/invites", { method: "POST", body }),
  cancelInvite: (id: string) => request<{ team: Team }>(`/team/invites/${encodeURIComponent(id)}`, { method: "DELETE" }),
  removeMember: (id: string) => request<{ team: Team }>(`/team/members/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // The invited person's own login to the account, from the emailed code.
  joinTeam: (body: { email: string; code: string; password: string }) =>
    request<Session>("/team/join", { method: "POST", body }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  requestEmailCode: (body: { role: Role; email: string }) =>
    request<{ email: string; expiresAt: number; devCode?: string }>(
      "/auth/email-code",
      { method: "POST", body },
    ),
  verifyEmailCode: (body: { email: string; code: string }) =>
    request<{ verificationToken: string }>("/auth/email-code/verify", {
      method: "POST",
      body,
    }),
  signup: (body: SignupPayload) =>
    request<Session>("/auth/signup", { method: "POST", body }),
  requestPasswordResetCode: (body: { email: string }) =>
    request<{ email: string; expiresAt: number; devCode?: string }>(
      "/auth/password-reset/code",
      { method: "POST", body },
    ),
  resetPassword: (body: { email: string; code: string; password: string }) =>
    request<Session | CodeTicket>("/auth/password-reset", { method: "POST", body }),
  updateContact: (body: AccountContact) => request<{ account: Account }>("/auth/contact", { method: "PUT", body }),
  savePreferences: (body: { language?: "ko" | "en"; mailOff?: MailKind[] }) =>
    request<{ account: Account }>("/auth/preferences", { method: "PUT", body }),
  referral: () => request<{ code: string; joined: number; rewarded: number; rewardDays: number }>("/auth/referral"),
  saveTerms: (terms: { name: string; from: string }[]) =>
    request<{ account: Account }>("/auth/terms", { method: "PUT", body: { terms } }),
  saveTemplates: (templates: ProposalTemplate[]) =>
    request<{ account: Account }>("/auth/templates", { method: "PUT", body: { templates } }),
  readNotices: (read: string[]) =>
    request<{ readNotices: string[] }>("/auth/notices", { method: "PUT", body: { read } }),
  changePassword: (body: { current: string; next: string }) =>
    request<void>("/auth/password", { method: "POST", body }),
  emailChangeCode: (body: { email: string; password: string }) =>
    request<{ email: string; expiresAt: number; devCode?: string }>("/auth/email/code", { method: "POST", body }),
  changeEmail: (body: { email: string; code: string }) =>
    request<{ account: Account }>("/auth/email", { method: "POST", body }),
  exportData: () => request<unknown>("/auth/export"),
  deleteAccount: (body: { password: string }) =>
    request<void>("/auth/account", { method: "DELETE", body }),

  matches: (role: Role) =>
    request<{ matches: Match[] }>("/matches", { query: { role } }),
  brands: () => request<{ brands: Match[] }>("/brands"),
  groups: () => request<{ groups: Match[] }>("/groups"),

  events: (role: Role) =>
    request<{ events: EventItem[] }>("/events", { query: { role } }),
  createEvent: (body: EventDraft) =>
    request<{ event: EventItem }>("/events", { method: "POST", body }),
  updateEvent: (id: string, body: EventDraft) =>
    request<{ event: EventItem }>(`/events/${encodeURIComponent(id)}`, { method: "PUT", body }),
  deleteEvent: (id: string) =>
    request<void>(`/events/${encodeURIComponent(id)}`, { method: "DELETE" }),

  proposals: () => request<ProposalState>("/proposals"),
  // About the account's next event unless it names one, with its note.
  board: (role?: Role) =>
    request<{ posts: BoardPost[]; mine: BoardPost[] }>("/board", { query: role ? { role } : undefined }),
  boardPost: (id: string, role?: Role) =>
    request<{ post: BoardPost }>(`/board/${encodeURIComponent(id)}`, { query: role ? { role } : undefined }),
  createPost: (draft: PostDraft) => request<{ post: BoardPost }>("/board", { method: "POST", body: draft }),
  updatePost: (id: string, draft: PostDraft) =>
    request<{ post: BoardPost }>(`/board/${encodeURIComponent(id)}`, { method: "PUT", body: draft }),
  closePost: (id: string) => request<{ post: BoardPost }>(`/board/${encodeURIComponent(id)}/close`, { method: "POST" }),
  deletePost: (id: string) => request<void>(`/board/${encodeURIComponent(id)}`, { method: "DELETE" }),
  propose: (matchId: string, draft: { eventId?: string; message?: string; postId?: string } = {}) =>
    request<ProposalState>("/proposals", {
      method: "POST",
      body: { matchId, ...draft },
    }),
  cancelProposal: (matchId: string) =>
    request<ProposalState>(`/proposals/${encodeURIComponent(matchId)}`, {
      method: "DELETE",
    }),

  offers: () => request<{ offers: SponsorOffer[] }>("/offers"),
  answerOffer: (id: string, decision: "accept" | "decline") =>
    request<{ offer: SponsorOffer }>(`/offers/${encodeURIComponent(id)}/${decision}`, {
      method: "POST",
    }),
  requests: () => request<{ requests: SponsorRequest[] }>("/requests"),
  answerRequest: (id: string, decision: "accept" | "decline") =>
    request<{ request: SponsorRequest }>(
      `/requests/${encodeURIComponent(id)}/${decision}`,
      { method: "POST" },
    ),
  analytics: () => request<{ sponsorships: Sponsorship[] }>("/analytics"),

  profile: () => request<{ profile: Match | null }>("/profile"),
  pauseProfile: (paused: boolean) => request<{ profile: Match }>("/profile/pause", { method: "PUT", body: { paused } }),
  saveProfile: (body: ProfileDraft) =>
    request<{ profile: Match }>("/profile", { method: "PUT", body }),

  nearbyPlaces: (category: string) =>
    request<NearbyPlaces>(`/places?category=${encodeURIComponent(category)}`),
  agreements: () => request<{ agreements: AgreementSummary[] }>("/agreements"),
  agreement: (id: string) => request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}`),
  saveMeasureMethods: (id: string, methods: MeasureMethod[]) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/methods`, { method: "PUT", body: { methods } }),
  saveAgreementItems: (id: string, items: { id?: string; side: Agreement["side"]; label: string }[]) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/items`, { method: "PUT", body: { items } }),
  confirmAgreement: (id: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/confirm`, { method: "POST" }),
  addShipment: (id: string, body: { carrier: string; number: string; note?: string }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/shipments`, { method: "POST", body }),
  deleteShipment: (id: string, shipmentId: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/shipments/${encodeURIComponent(shipmentId)}`, {
      method: "DELETE",
    }),
  saveAgreementValue: (id: string, value: { cash: number; inKind: number }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/value`, { method: "PUT", body: { value } }),
  insight: (id: string) => request<InsightAnswer>(`/insights/${encodeURIComponent(id)}`),
  sharedInsight: (token: string) => request<{ report: PremiumReport }>(`/insights/shared/${encodeURIComponent(token)}`),
  saveLift: (id: string, body: { before: number; during: number }) =>
    request<{ report: PremiumReport }>(`/insights/${encodeURIComponent(id)}/lift`, { method: "PUT", body }),
  shareInsight: (id: string) => request<{ shareToken: string }>(`/insights/${encodeURIComponent(id)}/share`, { method: "POST" }),
  unshareInsight: (id: string) => request<void>(`/insights/${encodeURIComponent(id)}/share`, { method: "DELETE" }),
  billing: () => request<BillingInfo>("/billing"),
  portfolio: () => request<{ locked: true } | { locked: false; portfolio: Portfolio }>("/analytics/portfolio"),
  partnerRequest: (wanted: string) =>
    request<{ plan: BillingInfo["plan"] }>("/billing/partner-requests", { method: "POST", body: { request: wanted } }),
  order: (kind: PaymentKind, targetId: string) =>
    request<PaymentOrder>("/billing/orders", { method: "POST", body: { kind, targetId } }),
  askTransfer: (orderId: string) =>
    request<{ order: Payment }>(`/billing/orders/${encodeURIComponent(orderId)}/transfer`, { method: "POST" }),
  cancelOrder: (orderId: string) =>
    request<{ order: Payment }>(`/billing/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" }),
  confirmPayment: (body: { orderId: string; paymentKey: string; amount: number }) =>
    request<{ order: Payment }>("/billing/confirm", { method: "POST", body }),
  updateAgreementItem: (id: string, itemId: string, body: { done?: boolean; links?: string[] }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body,
    }),
  addAgreementPhoto: (id: string, itemId: string, image: string) =>
    request<{ agreement: Agreement }>(
      `/agreements/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/photos`,
      { method: "POST", body: { image } },
    ),
  removeAgreementPhoto: (id: string, itemId: string, photo: string) =>
    request<{ agreement: Agreement }>(
      `/agreements/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/photos/${encodeURIComponent(photo)}`,
      { method: "DELETE" },
    ),
  askToCancelAgreement: (id: string, reason: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { reason } }),
  agreeToCancelAgreement: (id: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/cancel/accept`, { method: "POST" }),
  // Takes back this side's request, or declines the other side's.
  dropCancelRequest: (id: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/cancel`, { method: "DELETE" }),
  eventPage: (id: string) => request<EventPage>(`/events/${encodeURIComponent(id)}/page`),
  ledger: () => request<OwnLedger>("/ledger"),
  saveLedger: (body: { showValues?: boolean; notes?: Record<string, string> }) => request<OwnLedger>("/ledger", { method: "PUT", body }),
  makeLedgerLink: () => request<OwnLedger>("/ledger/link", { method: "POST" }),
  stopLedgerLink: () => request<OwnLedger>("/ledger/link", { method: "DELETE" }),
  publicLedger: (token: string) => request<PublicLedger>(`/ledger/public/${encodeURIComponent(token)}`),
  exploreEvents: () => request<{ events: ExploreEvent[]; cases: EventCase[] }>("/events/explore"),
  addEventPlan: (id: string, file: string, name: string) =>
    request<{ event: EventItem }>(`/events/${encodeURIComponent(id)}/plan`, { method: "POST", body: { file, name } }),
  deleteEventPlan: (id: string) => request<{ event: EventItem }>(`/events/${encodeURIComponent(id)}/plan`, { method: "DELETE" }),
  eventPlan: (id: string) => requestBlob(`/events/${encodeURIComponent(id)}/plan`),
  eventPhoto: (id: string, photo: string) =>
    requestBlob(`/events/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo)}`),
  addEventPhoto: (id: string, image: string) =>
    request<{ event: EventItem }>(`/events/${encodeURIComponent(id)}/photos`, { method: "POST", body: { image } }),
  deleteEventPhoto: (id: string, photo: string) =>
    request<{ event: EventItem }>(`/events/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo)}`, {
      method: "DELETE",
    }),
  agreementPhoto: (id: string, photo: string) =>
    requestBlob(`/agreements/${encodeURIComponent(id)}/photos/${encodeURIComponent(photo)}`),
  reviews: (about: string) =>
    request<{ summary: ReviewSummary; reviews: Review[] }>("/reviews", { query: { about } }),
  saveReview: (proposalId: string, body: { rating: number; tags: string[]; comment: string }) =>
    request<{ review: Review }>(`/reviews/${encodeURIComponent(proposalId)}`, { method: "PUT", body }),
  deleteReview: (proposalId: string) =>
    request<void>(`/reviews/${encodeURIComponent(proposalId)}`, { method: "DELETE" }),
  replyReview: (proposalId: string, text: string) =>
    request<{ review: Review }>(`/reviews/${encodeURIComponent(proposalId)}/reply`, { method: "PUT", body: { text } }),
  deleteReply: (proposalId: string) =>
    request<void>(`/reviews/${encodeURIComponent(proposalId)}/reply`, { method: "DELETE" }),
  inviteShop: (placeId: string) =>
    request<{ invite: ShopInvite }>("/invites", { method: "POST", body: { placeId } }),
  invite: (code: string) => request<InvitePageData>(`/invites/${encodeURIComponent(code)}`),
  acceptInvite: (code: string) =>
    request<InvitePageData & { listing: Match }>(`/invites/${encodeURIComponent(code)}/accept`, {
      method: "POST",
    }),

  inquiries: () => request<{ inquiries: Inquiry[] }>("/inquiries"),
  adminInquiries: (token: string) =>
    request<{ inquiries: AdminInquiry[] }>("/admin/inquiries", { headers: { "X-Admin-Token": token } }),
  adminStats: (token: string) =>
    request<{ stats: PlatformStats }>("/admin/stats", { headers: { "X-Admin-Token": token } }),
  answerInquiry: (token: string, id: string, answer: string) =>
    request<{ inquiry: Inquiry }>(`/admin/inquiries/${encodeURIComponent(id)}/answer`, {
      method: "POST",
      body: { answer },
      headers: { "X-Admin-Token": token },
    }),
  // Reports another account (by its listing), a message it sent, or a review.
  report: (
    body: (
      | { kind: "account"; listingId: string }
      | { kind: "message"; conversationId: string; messageId: string }
      | { kind: "review" | "reply"; reviewKey: string }
    ) & { reason: string; detail: string },
  ) => request<{ ok: true }>("/reports", { method: "POST", body }),
  business: () => request<BusinessStatus>("/profile/business"),
  verifyBusiness: (body: { number: string; startDate: string; owner: string }) =>
    request<{ business: NonNullable<BusinessStatus["business"]> }>("/profile/business", { method: "POST", body }),
  blocks: () => request<{ blocked: BlockedListing[] }>("/blocks"),
  block: (listingId: string) => request<{ ok: true }>("/blocks", { method: "POST", body: { listingId } }),
  unblock: (listingId: string) => request<void>(`/blocks/${encodeURIComponent(listingId)}`, { method: "DELETE" }),
  saved: () => request<{ saved: string[] }>("/saved"),
  calendarFeed: () => request<{ url: string | null }>("/calendar/feed"),
  createCalendarFeed: () => request<{ url: string }>("/calendar/feed", { method: "POST" }),
  deleteCalendarFeed: () => request<void>("/calendar/feed", { method: "DELETE" }),
  save: (listingId: string) => request<void>(`/saved/${encodeURIComponent(listingId)}`, { method: "PUT" }),
  unsave: (listingId: string) => request<void>(`/saved/${encodeURIComponent(listingId)}`, { method: "DELETE" }),
  adminReports: (token: string) =>
    request<{ reports: AdminReport[]; suspended: SuspendedAccount[] }>("/admin/reports", {
      headers: { "X-Admin-Token": token },
    }),
  resolveReport: (token: string, id: string, action: ReportAction) =>
    request<{ ok: true }>(`/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: { action },
      headers: { "X-Admin-Token": token },
    }),
  adminOverview: (token: string) => request<AdminOverview>("/admin/overview", { headers: { "X-Admin-Token": token } }),
  adminAccounts: (token: string, filters: { q?: string; role?: string; state?: string }) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]).toString()
    return request<{ accounts: AdminMember[] }>(`/admin/accounts${query ? `?${query}` : ""}`, { headers: { "X-Admin-Token": token } })
  },
  adminAccount: (token: string, id: string) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}`, { headers: { "X-Admin-Token": token } }),
  adminSuspend: (token: string, id: string) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/suspend`, {
      method: "POST",
      body: {},
      headers: { "X-Admin-Token": token },
    }),
  adminProposals: (token: string) =>
    request<{ proposals: AdminProposalRow[] }>("/admin/proposals", { headers: { "X-Admin-Token": token } }),
  adminPayments: (token: string) =>
    request<{ payments: AdminPayment[] }>("/admin/payments", { headers: { "X-Admin-Token": token } }),
  adminMarkPaid: (token: string, id: string) =>
    request<{ payment: AdminPayment }>(`/admin/payments/${encodeURIComponent(id)}/paid`, {
      method: "POST",
      body: {},
      headers: { "X-Admin-Token": token },
    }),
  adminCancelPayment: (token: string, id: string, reason: string) =>
    request<{ payment: AdminPayment }>(`/admin/payments/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: { reason },
      headers: { "X-Admin-Token": token },
    }),
  adminErrors: (token: string) =>
    request<{ errors: ErrorEntry[] }>("/admin/errors", { headers: { "X-Admin-Token": token } }),
  adminSaveNote: (token: string, id: string, note: string) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/note`, {
      method: "PUT",
      body: { note },
      headers: { "X-Admin-Token": token },
    }),
  adminLog: (token: string) => request<{ entries: AdminLogRow[] }>("/admin/log", { headers: { "X-Admin-Token": token } }),
  adminHealth: (token: string) => request<AdminHealth>("/admin/health", { headers: { "X-Admin-Token": token } }),
  adminAnnouncements: (token: string) =>
    request<{ announcements: AdminAnnouncement[] }>("/admin/announcements", { headers: { "X-Admin-Token": token } }),
  adminPostAnnouncement: (
    token: string,
    body: { text: string; tone: SiteNotice["tone"]; audience: AdminAnnouncement["audience"]; from?: string; until?: string },
  ) => request<{ announcement: AdminAnnouncement }>("/admin/announcements", { method: "POST", body, headers: { "X-Admin-Token": token } }),
  adminEndAnnouncement: (token: string, id: string) =>
    request<{ announcement: AdminAnnouncement }>(`/admin/announcements/${encodeURIComponent(id)}/end`, {
      method: "POST",
      headers: { "X-Admin-Token": token },
    }),
  // The operators' notices this viewer sees, and closing one (counted).
  announcements: () => request<{ announcements: SiteNotice[] }>("/announcements"),
  dismissAnnouncement: (id: string) => request<void>(`/announcements/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
  // The operators' switches the whole site reads: maintenance, sign-up, FAQ.
  siteState: () => request<SiteState>("/site"),
  countSearch: (q: string) => request<void>("/site/searches", { method: "POST", body: { q } }),
  adminLogout: (token: string, id: string) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/logout`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminTags: (token: string, id: string, tags: string[]) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/tags`, { method: "PUT", body: { tags }, headers: { "X-Admin-Token": token } }),
  adminBulk: (token: string, body: { ids: string[]; action: "suspend" | "logout" | "tag" | "untag"; tag?: string }) =>
    request<{ done: number }>("/admin/accounts/bulk", { method: "POST", body, headers: { "X-Admin-Token": token } }),
  adminBusiness: (token: string, id: string, body: { verified: boolean; number?: string }) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/business`, { method: "PUT", body, headers: { "X-Admin-Token": token } }),
  adminGrantPartners: (token: string, id: string, days: number) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/partners`, { method: "POST", body: { days }, headers: { "X-Admin-Token": token } }),
  adminResetDemo: (token: string) => request<{ ok: true }>("/admin/demo/reset", { method: "POST", headers: { "X-Admin-Token": token } }),
  adminStale: (token: string) => request<{ proposals: AdminStaleProposal[] }>("/admin/proposals/stale", { headers: { "X-Admin-Token": token } }),
  adminProposal: (token: string, id: string) =>
    request<{ proposal: AdminProposalDetail }>(`/admin/proposals/${encodeURIComponent(id)}`, { headers: { "X-Admin-Token": token } }),
  adminNudge: (token: string, id: string) =>
    request<{ ok: true }>(`/admin/proposals/${encodeURIComponent(id)}/nudge`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminAgreements: (token: string) => request<{ agreements: AdminAgreementRow[] }>("/admin/agreements", { headers: { "X-Admin-Token": token } }),
  adminEvents: (token: string) => request<{ events: AdminEventRow[] }>("/admin/events", { headers: { "X-Admin-Token": token } }),
  adminLive: (token: string) => request<AdminLive>("/admin/live", { headers: { "X-Admin-Token": token } }),
  adminPosts: (token: string) => request<{ posts: AdminPostRow[] }>("/admin/posts", { headers: { "X-Admin-Token": token } }),
  adminPostAction: (token: string, id: string, action: "hide" | "show" | "close") =>
    request<void>(`/admin/posts/${encodeURIComponent(id)}/${action}`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminReviews: (token: string) => request<{ reviews: AdminReviewRow[] }>("/admin/reviews", { headers: { "X-Admin-Token": token } }),
  adminReviewAction: (token: string, id: string, action: "hide" | "show" | "pin" | "unpin") =>
    request<void>(`/admin/reviews/${encodeURIComponent(id)}/${action}`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminInvites: (token: string) => request<AdminInvites>("/admin/invites", { headers: { "X-Admin-Token": token } }),
  adminHandling: (token: string, id: string, body: { assignee: string; held: boolean }) =>
    request<{ handling: AdminInquiry["handling"] }>(`/admin/inquiries/${encodeURIComponent(id)}/handling`, { method: "PUT", body, headers: { "X-Admin-Token": token } }),
  adminFaq: (token: string) => request<SiteFaq>("/admin/faq", { headers: { "X-Admin-Token": token } }),
  adminAddFaq: (token: string, body: { topic: FaqTopicKey; question: string; answer: string; featured: boolean }) =>
    request<SiteFaq>("/admin/faq", { method: "POST", body, headers: { "X-Admin-Token": token } }),
  adminRemoveFaq: (token: string, id: string) =>
    request<SiteFaq>(`/admin/faq/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Admin-Token": token } }),
  adminHideFaq: (token: string, question: string, hidden: boolean) =>
    request<SiteFaq>("/admin/faq/hidden", { method: "PUT", body: { question, hidden }, headers: { "X-Admin-Token": token } }),
  adminInsights: (token: string) => request<AdminInsights>("/admin/insights", { headers: { "X-Admin-Token": token } }),
  adminSetKpi: (token: string, body: { signups?: number | null; proposals?: number | null; revenue?: number | null }) =>
    request<{ kpi: AdminInsights["kpi"] }>("/admin/settings/kpi", { method: "PUT", body, headers: { "X-Admin-Token": token } }),
  adminSetMaintenance: (token: string, body: { on: boolean; message: string; blockSignups: boolean }) =>
    request<{ maintenance: AdminSystem["maintenance"] }>("/admin/settings/maintenance", { method: "PUT", body, headers: { "X-Admin-Token": token } }),
  adminSystem: (token: string) => request<AdminSystem>("/admin/system", { headers: { "X-Admin-Token": token } }),
  unsuspendAccount: (token: string, id: string) =>
    request<void>(`/admin/accounts/${encodeURIComponent(id)}/unsuspend`, {
      method: "POST",
      headers: { "X-Admin-Token": token },
    }),
  // The account has seen its answers, so the bell lets them go.
  readInquiryAnswers: () => request<{ inquiries: Inquiry[] }>("/inquiries/read", { method: "POST" }),
  askInquiry: (body: { category: string; question: string }) =>
    request<{ inquiry: Inquiry }>("/inquiries", { method: "POST", body }),

  conversations: () => request<{ conversations: Conversation[] }>("/conversations"),
  startConversation: (partnerId: string) =>
    request<{ conversation: Conversation }>("/conversations", {
      method: "POST",
      body: { partnerId },
    }),
  // With `since` (the stamp of what the page shows) the answer waits, up to
  // about 20 seconds, for something new.
  conversation: (id: string, since?: string, signal?: AbortSignal) =>
    request<{ conversation: Conversation; stamp: string }>(`/conversations/${encodeURIComponent(id)}`, {
      ...(since ? { query: { since } } : {}),
      signal,
    }),
  sendMessage: (id: string, text: string) =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: { text } },
    ),
  proposeMeeting: (id: string, body: { date: string; time: string; minutes: number; place: string; note?: string }) =>
    request<{ conversation: Conversation }>(`/conversations/${encodeURIComponent(id)}/meetings`, { method: "POST", body }),
  answerMeeting: (id: string, messageId: string, answer: "accept" | "decline" | "cancel") =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/meetings/${encodeURIComponent(messageId)}/answer`,
      { method: "POST", body: { answer } },
    ),
  editMessage: (id: string, messageId: string, text: string) =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
      { method: "PUT", body: { text } },
    ),
  deleteMessage: (id: string, messageId: string) =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
      { method: "DELETE" },
    ),
  // A photo (resized by lib/image.ts) or a PDF, as data URLs, each a message.
  sendFile: (id: string, file: string, name: string) =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/attachments`,
      { method: "POST", body: { file, name } },
    ),
  chatFile: (id: string, file: string) =>
    requestBlob(`/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file)}`),

  // `role` picks the demo side for visitors; the server ignores it once
  // logged in.
  measurements: (role: Role) =>
    request<{ measurements: EventMeasurement[] }>("/measurements", { query: { role } }),
  measurement: (eventId: string, role: Role = "학생단체") =>
    request<{ metrics: Metrics; report: Report }>(`/measurements/${encodeURIComponent(eventId)}`, {
      query: { role },
    }),
  measurementLog: (eventId: string, kind?: MetricKind, role: Role = "학생단체") =>
    request<{ entries: MetricEntry[] }>(`/measurements/${encodeURIComponent(eventId)}/log`, {
      query: { role, ...(kind ? { kind } : {}) },
    }),
  saveGoals: (
    eventId: string,
    goals: Pick<Report, "expectedAudience" | "averageSpend" | "snsReach" | "valueBreakdown" | "targets" | "coupon" | "staffPin"> & {
      sponsors?: { id: string; store: string; title: string; value?: number; staffPin?: string }[]
    },
  ) =>
    request<{ metrics: Metrics; report: Report }>(`/measurements/${encodeURIComponent(eventId)}/goals`, {
      method: "PUT",
      body: goals,
    }),
  checkIn: (code: string) => request<CheckInInfo>(`/check-in/${encodeURIComponent(code)}`),
  // A scan answers a pass; a coupon sends it with the coupon's id and
  // answers its number.
  answerSurvey: (code: string, body: { pass: string; grade?: string; field?: string; visited?: string }) =>
    request<{ ok: true }>(`/check-in/${encodeURIComponent(code)}/survey`, { method: "POST", body }),
  recordCheckIn: (code: string, kind: "scans" | "coupons", body?: { pass: string; couponId?: string }) =>
    request<{ entry: MetricEntry; pass?: string; coupon?: string }>(
      `/check-in/${encodeURIComponent(code)}/${kind}`,
      { method: "POST", body },
    ),
  checkInPass: (code: string, pass: string) =>
    request<{ coupons: Record<string, { number: string | null; visited: boolean }> }>(
      `/check-in/${encodeURIComponent(code)}/passes/${encodeURIComponent(pass)}`,
    ),
  // The store staff's device: the participant's coupon number and the PIN.
  confirmVisit: (code: string, body: { pin: string; coupon: string }) =>
    request<{ entry: MetricEntry; store: string }>(`/check-in/${encodeURIComponent(code)}/staff/visits`, {
      method: "POST",
      body,
    }),
  // A venue page (the brand's /staff, the group's /group): its PIN opens what
  // its side confirms, and each confirmation (or correction, a negative
  // amount) answers the share's counts as they now stand.
  venueSession: (code: string, page: VenuePage, pin: string) =>
    request<VenueSession>(`/check-in/${encodeURIComponent(code)}/${page}/session`, { method: "POST", body: { pin } }),
  venueCount: (code: string, page: VenuePage, body: { pin: string; share: string; method: MethodKind; amount: number }) =>
    request<{ entry: MetricEntry; share: VenueShare }>(`/check-in/${encodeURIComponent(code)}/${page}/count`, {
      method: "POST",
      body,
    }),
}
