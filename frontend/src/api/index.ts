import type {
  Account,
  ProposalTermsDraft,
  HistoryItem,
  AccountContact,
  AdminAgreementRow,
  AdminApplication,
  AdminReferralReward,
  AdminLoginDone,
  AdminLoginStart,
  AdminOperator,
  AdminAnnouncement,
  AdminEventRow,
  AdminHealth,
  AdminInquiry,
  AdminInsights,
  AdminInvites,
  AdminLive,
  Pending,
  AdminLogRow,
  AdminMember,
  AdminMemberDetail,
  AdminOverview,
  AdminPayment,
  BackupSummary,
  AdminPostRow,
  AdminProposalDetail,
  AdminProposalRow,
  AdminReport,
  AdminReviewRow,
  AdminStaleProposal,
  AdminSystem,
  Agreement,
  AgreementSummary,
  SavedSearch,
  BillingInfo,
  BlockedListing,
  BoardPost,
  BusinessStatus,
  Dispute,
  DisputeOutcome,
  DisputeReason,
  GroupVerification,
  UploadDocument,
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
  SnsPost,
  NearbyPlaces,
  Payment,
  LocalCampaign,
  LocalInfo,
  LocalReport,
  PaymentKind,
  PaymentOrder,
  PlanTable,
  RefundQuote,
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

export { ApiError, errorMessage, getToken, isAborted, setToken, tokenPersists } from "./client"

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
  // 방문자가 가지고 온 초대 코드 (친구 초대).
  referral?: string
  // 회사 이메일이 없는 매장: 그 초대와 확인할 서류.
  invite?: string
  document?: { file: string; name: string }
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

// 계정이 보낸 제안과 지금까지 각 브랜드의 답.
export type ProposalState = {
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  // 어느 쪽으로든 확정된 협찬 (보내서 수락됐거나, 받아서 수락된 것).
  confirmed: number
  // 계정이 보낸 것을 최신 순으로, 받은편지함용.
  sent: SentProposal[]
  // 자기 쪽에 남은 계약서 할 일(끝내고 증빙을 붙일 것)과 그런 계약서 수.
  openTasks?: OpenTasks
}

// 자기 쪽에 남은 계약서 일(backend lib/agreements.ts openTasksOf). 예전 서버는
// tasks와 agreements만 보낸다.
export type OpenTasks = {
  tasks: number
  agreements: number
  // 내가 아직 확인하지 않은 계약서, 내 쪽은 확인했고 상대를 기다리는 계약서.
  toConfirm?: number
  awaitingPartner?: number
  // 그런 계약서가 하나뿐일 때 바로 열 첫 계약서.
  confirmId?: string
  taskId?: string
}

// 백엔드 엔드포인트마다 함수 하나 (backend/src/routes 참고).
export const api = {
  me: () => request<{ account: Account }>("/auth/me"),
  login: (body: { role: Role; email: string; password: string }) =>
    request<Session | CodeTicket>("/auth/login", { method: "POST", body }),
  // 2단계 로그인이 켜진 경우의 두 번째 단계: 앱의 코드나 복구 코드.
  loginCode: (body: { email: string; ticket: string; code: string }) =>
    request<Session & { recoveryLeft?: number; recoveryCodes?: string[] }>("/auth/login/code", { method: "POST", body }),
  twoFactorSetup: (password: string) =>
    request<{ secret: string; url: string }>("/auth/two-factor/setup", { method: "POST", body: { password } }),
  twoFactorEnable: (code: string) =>
    request<{ account: Account; recoveryCodes: string[] }>("/auth/two-factor/enable", { method: "POST", body: { code } }),
  twoFactorDisable: (body: { password: string; code: string }) =>
    request<{ account: Account }>("/auth/two-factor/disable", { method: "POST", body }),
  sessions: () => request<{ sessions: DeviceSession[] }>("/auth/sessions"),
  endSession: (id: string) => request<void>(`/auth/sessions/${encodeURIComponent(id)}`, { method: "DELETE" }),
  endOtherSessions: () => request<void>("/auth/sessions", { method: "DELETE" }),
  // Kakao와 Naver: 제공되는 제공자, 브라우저를 보낼 주소, 서버가 쿠키로 돌려준
  // 로그인, 연결 해제.
  socialProviders: () => request<{ providers: SocialProvider[] }>("/auth/social"),
  socialStart: (provider: SocialProvider, intent: "login" | "link") =>
    request<{ url: string }>(`/auth/social/${provider}/start`, { method: "POST", body: { intent } }),
  socialComplete: () =>
    request<Session | (CodeTicket & { email: string })>("/auth/social/complete", { method: "POST" }),
  socialUnlink: (provider: SocialProvider) =>
    request<{ account: Account }>(`/auth/social/${provider}`, { method: "DELETE" }),
  // 학생회의 동아리와 코드, 그리고 동아리가 학생회에 거는 연결.
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
  removeMember: (id: string) => request<{ team: Team; linksStopped?: boolean }>(`/team/members/${encodeURIComponent(id)}`, { method: "DELETE" }),
  // 초대받은 사람 자신이 이메일로 받은 코드로 계정에 로그인한다.
  joinTeam: (body: { email: string; code: string; password: string; document: { file: string; name: string } }) =>
    request<Pending>("/team/join", { method: "POST", body }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  requestEmailCode: (body: { role: Role; email: string; invite?: string }) =>
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
    request<Session | Pending>("/auth/signup", { method: "POST", body }),
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
  referral: () => request<{ code: string; joined: number; rewarded: number; waiting: number; rewardDays: number }>("/auth/referral"),
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
  // 행사를 지정하지 않으면 계정의 다음 행사에 대해, 메모와 함께.
  board: (role?: Role) =>
    request<{ posts: BoardPost[]; mine: BoardPost[] }>("/board", { query: role ? { role } : undefined }),
  boardPost: (id: string, role?: Role) =>
    request<{ post: BoardPost }>(`/board/${encodeURIComponent(id)}`, { query: role ? { role } : undefined }),
  createPost: (draft: PostDraft) => request<{ post: BoardPost }>("/board", { method: "POST", body: draft }),
  updatePost: (id: string, draft: PostDraft) =>
    request<{ post: BoardPost }>(`/board/${encodeURIComponent(id)}`, { method: "PUT", body: draft }),
  closePost: (id: string) => request<{ post: BoardPost }>(`/board/${encodeURIComponent(id)}/close`, { method: "POST" }),
  deletePost: (id: string) => request<void>(`/board/${encodeURIComponent(id)}`, { method: "DELETE" }),
  propose: (
    matchId: string,
    draft: { eventId?: string; message?: string; postId?: string; terms?: ProposalTermsDraft } = {},
  ) =>
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
  portfolioHistory: () => request<{ items: HistoryItem[] }>("/profile/history"),
  pauseProfile: (paused: boolean) => request<{ profile: Match }>("/profile/pause", { method: "PUT", body: { paused } }),
  saveProfile: (body: ProfileDraft) =>
    request<{ profile: Match }>("/profile", { method: "PUT", body }),

  nearbyPlaces: (category: string) =>
    request<NearbyPlaces>(`/places?category=${encodeURIComponent(category)}`),
  agreements: () => request<{ agreements: AgreementSummary[] }>("/agreements"),
  agreement: (id: string) => request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}`),
  applyContractTemplate: (id: string, kinds: string[]) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/template`, { method: "PUT", body: { kinds } }),
  saveMeasureMethods: (id: string, methods: MeasureMethod[]) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/methods`, { method: "PUT", body: { methods } }),
  saveAgreementItems: (id: string, items: { id?: string; side: Agreement["side"]; label: string }[]) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/items`, { method: "PUT", body: { items } }),
  // 화면에서 본 예상 인원을 함께 보낸다.
  confirmAgreement: (id: string, audience?: number) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { audience } }),
  addShipment: (id: string, body: { carrier: string; number: string; note?: string }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/shipments`, { method: "POST", body }),
  deleteShipment: (id: string, shipmentId: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/shipments/${encodeURIComponent(shipmentId)}`, {
      method: "DELETE",
    }),
  addSnsPost: (id: string, body: { url: string; reach: number }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/sns-posts`, { method: "POST", body }),
  saveSnsPost: (id: string, postId: string, body: { url: string; reach: number }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/sns-posts/${encodeURIComponent(postId)}`, {
      method: "PUT",
      body,
    }),
  deleteSnsPost: (id: string, postId: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/sns-posts/${encodeURIComponent(postId)}`, {
      method: "DELETE",
    }),
  // 브랜드가 화면에서 본 내용을 함께 보낸다. 그사이 바뀌었으면 서버가 막는다.
  confirmSnsPost: (id: string, post: Pick<SnsPost, "id" | "url" | "reach" | "photos">) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/sns-posts/${encodeURIComponent(post.id)}/confirm`, {
      method: "POST",
      body: { url: post.url, reach: post.reach, photos: post.photos },
    }),
  rejectSnsPost: (id: string, postId: string, reason: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/sns-posts/${encodeURIComponent(postId)}/reject`, {
      method: "POST",
      body: { reason },
    }),
  addSnsPostPhoto: (id: string, postId: string, image: string) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/sns-posts/${encodeURIComponent(postId)}/photos`, {
      method: "POST",
      body: { image },
    }),
  deleteSnsPostPhoto: (id: string, postId: string, photo: string) =>
    request<{ agreement: Agreement }>(
      `/agreements/${encodeURIComponent(id)}/sns-posts/${encodeURIComponent(postId)}/photos/${encodeURIComponent(photo)}`,
      { method: "DELETE" },
    ),
  saveAgreementValue: (id: string, value: { cash: number; inKind: number }) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/value`, { method: "PUT", body: { value } }),
  insight: (id: string) => request<InsightAnswer>(`/insights/${encodeURIComponent(id)}`),
  sharedInsight: (token: string) => request<{ report: PremiumReport }>(`/insights/shared/${encodeURIComponent(token)}`),
  saveLift: (id: string, body: { before: number; during: number }) =>
    request<{ report: PremiumReport }>(`/insights/${encodeURIComponent(id)}/lift`, { method: "PUT", body }),
  shareInsight: (id: string) => request<{ shareToken: string }>(`/insights/${encodeURIComponent(id)}/share`, { method: "POST" }),
  unshareInsight: (id: string) => request<void>(`/insights/${encodeURIComponent(id)}/share`, { method: "DELETE" }),
  plans: () => request<PlanTable>("/billing/plans"),
  // 플랫폼 밖에서 오가는 현금 협찬금의 지급 기록 (backend lib/payouts.ts).
  savePayoutDue: (id: string, dueDate: string | null) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/payout`, { method: "PUT", body: { dueDate } }),
  markPayout: (id: string, mark: "paid" | "received", on: boolean) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/payout/${mark}`, { method: on ? "POST" : "DELETE" }),
  refundQuote: (id: string) => request<RefundQuote>(`/billing/payments/${encodeURIComponent(id)}/refund`),
  refund: (id: string, amount: number) =>
    request<{ payment: Payment }>(`/billing/payments/${encodeURIComponent(id)}/refund`, { method: "POST", body: { amount } }),
  local: () => request<LocalInfo>("/local"),
  openLocalCampaign: (body: { store: string; title: string }) => request<{ campaign: LocalCampaign }>("/local/campaign", { method: "POST", body }),
  updateLocalCampaign: (body: { store: string; title: string }) => request<{ campaign: LocalCampaign }>("/local/campaign", { method: "PUT", body }),
  rotateLocalPin: () => request<{ campaign: LocalCampaign }>("/local/campaign/pin", { method: "POST" }),
  localReport: (month?: string) => request<LocalReport>(`/local/report${month ? `?month=${encodeURIComponent(month)}` : ""}`),
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
  // 이쪽의 요청을 거두거나, 상대의 요청을 거절한다.
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
  // 서류를 보내면 운영자가 확인한 뒤 가게를 잇는다.
  acceptInvite: (code: string, document: { file: string; name: string }) =>
    request<{ pending: true }>(`/invites/${encodeURIComponent(code)}/accept`, {
      method: "POST",
      body: { document },
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
  // 다른 계정(리스팅으로 가리킴), 그 계정이 보낸 메시지, 또는 후기를 신고한다.
  report: (
    body: (
      | { kind: "account"; listingId: string }
      | { kind: "message"; conversationId: string; messageId: string }
      | { kind: "review" | "reply"; reviewKey: string }
    ) & { reason: string; detail: string },
  ) => request<{ ok: true }>("/reports", { method: "POST", body }),
  business: () => request<BusinessStatus>("/profile/business"),
  // 학생단체 확인(#334): 대표가 대표자 이름과 서류 둘을 낸다.
  groupVerification: () => request<GroupVerification>("/groups/verification"),
  requestGroupVerification: (body: { representative: string; enrollment: UploadDocument; membership: UploadDocument }) =>
    request<{ pending: true }>("/groups/verification", { method: "POST", body }),
  // 협찬 분쟁(#335). 계약 양쪽 당사자만 본다.
  allDisputes: () => request<{ disputes: Dispute[] }>("/disputes"),
  disputes: (agreementId: string) => request<{ disputes: Dispute[] }>(`/disputes?agreementId=${encodeURIComponent(agreementId)}`),
  openDispute: (body: { agreementId: string; reason: DisputeReason; detail: string }) =>
    request<{ dispute: Dispute }>("/disputes", { method: "POST", body }),
  addDisputeStatement: (id: string, text: string) =>
    request<{ dispute: Dispute }>(`/disputes/${encodeURIComponent(id)}/statements`, { method: "POST", body: { text } }),
  addDisputeEvidence: (id: string, document: UploadDocument) =>
    request<{ dispute: Dispute }>(`/disputes/${encodeURIComponent(id)}/evidence`, { method: "POST", body: document }),
  disputeEvidence: (id: string, evidenceId: string) =>
    requestBlob(`/disputes/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`),
  withdrawDispute: (id: string) => request<{ dispute: Dispute }>(`/disputes/${encodeURIComponent(id)}/withdraw`, { method: "POST" }),
  verifyBusiness: (body: { number: string; startDate: string; owner: string }) =>
    request<{ business: NonNullable<BusinessStatus["business"]> }>("/profile/business", { method: "POST", body }),
  blocks: () => request<{ blocked: BlockedListing[] }>("/blocks"),
  block: (listingId: string) => request<{ ok: true }>("/blocks", { method: "POST", body: { listingId } }),
  unblock: (listingId: string) => request<void>(`/blocks/${encodeURIComponent(listingId)}`, { method: "DELETE" }),
  saved: () => request<{ saved: string[] }>("/saved"),
  savedSearches: () => request<{ searches: SavedSearch[] }>("/saved-searches"),
  saveSearch: (body: { name?: string; query?: string; industry?: string; kind?: string; school?: string }) =>
    request<{ search: SavedSearch }>("/saved-searches", { method: "POST", body }),
  readSavedSearch: (id: string) => request<{ search: SavedSearch }>(`/saved-searches/${encodeURIComponent(id)}/read`, { method: "POST" }),
  deleteSavedSearch: (id: string) => request<void>(`/saved-searches/${encodeURIComponent(id)}`, { method: "DELETE" }),
  calendarFeed: () => request<{ url: string | null }>("/calendar/feed"),
  createCalendarFeed: () => request<{ url: string }>("/calendar/feed", { method: "POST" }),
  deleteCalendarFeed: () => request<void>("/calendar/feed", { method: "DELETE" }),
  save: (listingId: string) => request<void>(`/saved/${encodeURIComponent(listingId)}`, { method: "PUT" }),
  unsave: (listingId: string) => request<void>(`/saved/${encodeURIComponent(listingId)}`, { method: "DELETE" }),
  adminReports: (token: string) =>
    request<{ reports: AdminReport[]; suspended: SuspendedAccount[] }>("/admin/reports", {
      headers: { "X-Admin-Token": token },
    }),
  resolveReport: (token: string, id: string, action: ReportAction, reason?: string) =>
    request<{ ok: true; noticeSent?: boolean }>(`/admin/reports/${encodeURIComponent(id)}/resolve`, {
      method: "POST",
      body: { action, ...(reason ? { reason } : {}) },
      headers: { "X-Admin-Token": token },
    }),
  adminOverview: (token: string) => request<AdminOverview>("/admin/overview", { headers: { "X-Admin-Token": token } }),
  adminAccounts: (token: string, filters: { q?: string; role?: string; state?: string }) => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value) as [string, string][]).toString()
    return request<{ accounts: AdminMember[] }>(`/admin/accounts${query ? `?${query}` : ""}`, { headers: { "X-Admin-Token": token } })
  },
  adminAccount: (token: string, id: string) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}`, { headers: { "X-Admin-Token": token } }),
  adminSuspend: (token: string, id: string, reason?: string) =>
    request<{ account: AdminMemberDetail; noticeSent?: boolean }>(`/admin/accounts/${encodeURIComponent(id)}/suspend`, {
      method: "POST",
      body: reason ? { reason } : {},
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
  adminRefundQuote: (token: string, id: string) =>
    request<RefundQuote>(`/admin/payments/${encodeURIComponent(id)}/refund`, { headers: { "X-Admin-Token": token } }),
  // outside: Toss가 부분 취소를 거절해 운영자가 계좌로 직접 돌려준 환불을 기록만 한다.
  adminCancelPayment: (token: string, id: string, reason: string, outside = false) =>
    request<{ payment: AdminPayment }>(`/admin/payments/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: { reason, ...(outside ? { outside: true } : {}) },
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
  adminBackupSummary: (token: string, hour: string) =>
    request<BackupSummary>(`/admin/backups/${encodeURIComponent(hour)}/summary`, { headers: { "X-Admin-Token": token } }),
  adminRestoreBackup: (token: string, hour: string, confirm: string) =>
    request<BackupSummary>(`/admin/backups/${encodeURIComponent(hour)}/restore`, {
      method: "POST",
      body: { confirm },
      headers: { "X-Admin-Token": token },
    }),
  adminHealth: (token: string) => request<AdminHealth>("/admin/health", { headers: { "X-Admin-Token": token } }),
  adminAnnouncements: (token: string) =>
    request<{ announcements: AdminAnnouncement[] }>("/admin/announcements", { headers: { "X-Admin-Token": token } }),
  adminPostAnnouncement: (
    token: string,
    body: { text: string; textEn?: string; tone: SiteNotice["tone"]; audience: AdminAnnouncement["audience"]; from?: string; until?: string },
  ) => request<{ announcement: AdminAnnouncement }>("/admin/announcements", { method: "POST", body, headers: { "X-Admin-Token": token } }),
  adminEndAnnouncement: (token: string, id: string) =>
    request<{ announcement: AdminAnnouncement }>(`/admin/announcements/${encodeURIComponent(id)}/end`, {
      method: "POST",
      headers: { "X-Admin-Token": token },
    }),
  // 이 사용자에게 보이는 운영자의 공지와, 공지 닫기 (집계된다).
  announcements: () => request<{ announcements: SiteNotice[] }>("/announcements"),
  dismissAnnouncement: (id: string) => request<void>(`/announcements/${encodeURIComponent(id)}/dismiss`, { method: "POST" }),
  // 사이트 전체가 읽는 운영자의 스위치: 점검, 가입, FAQ.
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
  adminLogin: (body: { email: string; password: string }) => request<AdminLoginStart>("/admin/session", { method: "POST", body }),
  adminLoginCode: (body: { email: string; ticket: string; code: string }) =>
    request<AdminLoginDone>("/admin/session/code", { method: "POST", body }),
  adminSession: (token: string) =>
    request<{ operator: AdminOperator | null; tokenClosed: boolean }>("/admin/session", { headers: { "X-Admin-Token": token } }),
  adminEndSession: (token: string) => request<void>("/admin/session", { method: "DELETE", headers: { "X-Admin-Token": token } }),
  adminOperators: (token: string) => request<{ operators: AdminOperator[] }>("/admin/operators", { headers: { "X-Admin-Token": token } }),
  adminAddOperator: (token: string, body: { email: string; name: string; password: string }) =>
    request<{ operator: AdminOperator }>("/admin/operators", { method: "POST", headers: { "X-Admin-Token": token }, body }),
  adminDisableOperator: (token: string, id: string) =>
    request<{ operator: AdminOperator }>(`/admin/operators/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "X-Admin-Token": token } }),
  adminApplications: (token: string) =>
    request<{ applications: AdminApplication[] }>("/admin/applications", { headers: { "X-Admin-Token": token } }),
  adminApplicationDocument: (token: string, id: string, part?: "membership") =>
    requestBlob(`/admin/applications/${encodeURIComponent(id)}/document${part ? `?part=${part}` : ""}`, { headers: { "X-Admin-Token": token } }),
  adminUnverifyGroup: (token: string, id: string, reason: string) =>
    request<{ account: AdminMemberDetail }>(`/admin/accounts/${encodeURIComponent(id)}/group-verified`, {
      method: "DELETE",
      headers: { "X-Admin-Token": token },
      body: { reason },
    }),
  adminDisputes: (token: string) => request<{ disputes: Dispute[] }>("/admin/disputes", { headers: { "X-Admin-Token": token } }),
  adminDisputeEvidence: (token: string, id: string, evidenceId: string) =>
    requestBlob(`/admin/disputes/${encodeURIComponent(id)}/evidence/${encodeURIComponent(evidenceId)}`, { headers: { "X-Admin-Token": token } }),
  adminReviewDispute: (token: string, id: string) =>
    request<{ dispute: Dispute }>(`/admin/disputes/${encodeURIComponent(id)}/review`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminDisputeNote: (token: string, id: string, text: string) =>
    request<{ dispute: Dispute }>(`/admin/disputes/${encodeURIComponent(id)}/notes`, { method: "POST", headers: { "X-Admin-Token": token }, body: { text } }),
  adminDecideDispute: (token: string, id: string, outcome: DisputeOutcome, note: string) =>
    request<{ dispute: Dispute }>(`/admin/disputes/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers: { "X-Admin-Token": token },
      body: { outcome, note },
    }),
  adminApproveApplication: (token: string, id: string) =>
    request<void>(`/admin/applications/${encodeURIComponent(id)}/approve`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminRejectApplication: (token: string, id: string, reason: string) =>
    request<void>(`/admin/applications/${encodeURIComponent(id)}/reject`, { method: "POST", headers: { "X-Admin-Token": token }, body: { reason } }),
  adminReferrals: (token: string) =>
    request<{ rewards: AdminReferralReward[] }>("/admin/referrals", { headers: { "X-Admin-Token": token } }),
  adminApproveReferral: (token: string, id: string) =>
    request<void>(`/admin/referrals/${encodeURIComponent(id)}/approve`, { method: "POST", headers: { "X-Admin-Token": token } }),
  adminRejectReferral: (token: string, id: string, reason: string) =>
    request<void>(`/admin/referrals/${encodeURIComponent(id)}/reject`, { method: "POST", headers: { "X-Admin-Token": token }, body: { reason } }),
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
  // 계정이 답변을 봤으므로 종이 그것들을 놓아 준다.
  readInquiryAnswers: () => request<{ inquiries: Inquiry[] }>("/inquiries/read", { method: "POST" }),
  askInquiry: (body: { category: string; question: string }) =>
    request<{ inquiry: Inquiry }>("/inquiries", { method: "POST", body }),

  conversations: () => request<{ conversations: Conversation[] }>("/conversations"),
  startConversation: (partnerId: string) =>
    request<{ conversation: Conversation }>("/conversations", {
      method: "POST",
      body: { partnerId },
    }),
  // `since`(페이지가 보여주는 것의 스탬프)를 주면 새로운 것이 생길 때까지 최대
  // 20초 정도 답이 기다린다.
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
  // 사진(lib/image.ts로 줄인 것)이나 PDF를 data URL로, 각각 메시지 하나가 된다.
  sendFile: (id: string, file: string, name: string) =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/attachments`,
      { method: "POST", body: { file, name } },
    ),
  chatFile: (id: string, file: string) =>
    requestBlob(`/conversations/${encodeURIComponent(id)}/attachments/${encodeURIComponent(file)}`),

  // `role`은 방문자에게 보여줄 데모 쪽을 고른다. 로그인한 뒤에는 서버가
  // 무시한다.
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
  // 행사 주인이 자기 현장 PIN을 새로 만든다.
  rotateEventPin: (eventId: string, page: VenuePage) =>
    request<{ metrics: Metrics; report: Report }>(`/measurements/${encodeURIComponent(eventId)}/pin`, {
      method: "POST",
      body: { page },
    }),
  // 계약서에서 이쪽 현장 PIN을 새로 만든다.
  rotateAgreementPin: (id: string, page?: VenuePage) =>
    request<{ agreement: Agreement }>(`/agreements/${encodeURIComponent(id)}/pin`, { method: "POST", body: { page } }),
  checkIn: (code: string) => request<CheckInInfo>(`/check-in/${encodeURIComponent(code)}`),
  // 스캔하면 pass가 답으로 오고, 쿠폰은 쿠폰의 id와 함께 보내 그 번호를 답으로
  // 받는다.
  answerSurvey: (code: string, body: { pass: string; grade?: string; field?: string; visited?: string }) =>
    request<{ ok: true }>(`/check-in/${encodeURIComponent(code)}/survey`, { method: "POST", body }),
  recordCheckIn: (code: string, kind: "scans" | "coupons", body?: { pass: string; couponId?: string }) =>
    request<{ entry: MetricEntry; pass?: string; coupon?: string }>(
      `/check-in/${encodeURIComponent(code)}/${kind}`,
      { method: "POST", body },
    ),
  checkInPass: (code: string, pass: string) =>
    request<{ coupons: Record<string, { number: string | null; visited: boolean; expiresAt?: string }> }>(
      `/check-in/${encodeURIComponent(code)}/passes/${encodeURIComponent(pass)}`,
    ),
  // 매장 직원의 기기: 참여자의 쿠폰 번호와 PIN.
  confirmVisit: (code: string, body: { pin: string; coupon: string }) =>
    request<{ entry: MetricEntry; store: string }>(`/check-in/${encodeURIComponent(code)}/staff/visits`, {
      method: "POST",
      body,
    }),
  // 현장 페이지(브랜드의 /staff, 단체의 /group): PIN이 그쪽이 확인하는 것을
  // 열고, 각 확인(또는 정정, 음수)은 그 몫의 집계를 지금 상태 그대로 답한다.
  venueSession: (code: string, page: VenuePage, pin: string) =>
    request<VenueSession>(`/check-in/${encodeURIComponent(code)}/${page}/session`, { method: "POST", body: { pin } }),
  venueCount: (code: string, page: VenuePage, body: { pin: string; share: string; method: MethodKind; amount: number }) =>
    request<{ entry: MetricEntry; share: VenueShare }>(`/check-in/${encodeURIComponent(code)}/${page}/count`, {
      method: "POST",
      body,
    }),
}
