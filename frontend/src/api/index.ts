import type {
  Account,
  AdminInquiry,
  CheckInInfo,
  Conversation,
  EventItem,
  EventMeasurement,
  Inquiry,
  Match,
  MetricEntry,
  MetricKind,
  Metrics,
  ProfileDraft,
  Report,
  RequestStatus,
  Role,
  Session,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
} from "../types"
import { request } from "./client"

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
}

export type EventDraft = Pick<
  EventItem,
  "name" | "people" | "date" | "endDate" | "types" | "typeNote" | "budget"
>

// Proposals the account sent, with each brand's answer so far.
export type ProposalState = {
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
}

// One function per backend endpoint (see backend/src/routes).
export const api = {
  me: () => request<{ account: Account }>("/auth/me"),
  login: (body: { role: Role; email: string; password: string }) =>
    request<Session>("/auth/login", { method: "POST", body }),
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
    request<Session>("/auth/password-reset", { method: "POST", body }),
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
  deleteEvent: (id: string) =>
    request<void>(`/events/${encodeURIComponent(id)}`, { method: "DELETE" }),

  proposals: () => request<ProposalState>("/proposals"),
  propose: (matchId: string) =>
    request<ProposalState>("/proposals", {
      method: "POST",
      body: { matchId },
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
  saveProfile: (body: ProfileDraft) =>
    request<{ profile: Match }>("/profile", { method: "PUT", body }),

  inquiries: () => request<{ inquiries: Inquiry[] }>("/inquiries"),
  adminInquiries: (token: string) =>
    request<{ inquiries: AdminInquiry[] }>("/admin/inquiries", { headers: { "X-Admin-Token": token } }),
  answerInquiry: (token: string, id: string, answer: string) =>
    request<{ inquiry: Inquiry }>(`/admin/inquiries/${encodeURIComponent(id)}/answer`, {
      method: "POST",
      body: { answer },
      headers: { "X-Admin-Token": token },
    }),
  askInquiry: (body: { category: string; question: string }) =>
    request<{ inquiry: Inquiry }>("/inquiries", { method: "POST", body }),

  conversations: () => request<{ conversations: Conversation[] }>("/conversations"),
  startConversation: (partnerId: string) =>
    request<{ conversation: Conversation }>("/conversations", {
      method: "POST",
      body: { partnerId },
    }),
  conversation: (id: string) =>
    request<{ conversation: Conversation }>(`/conversations/${encodeURIComponent(id)}`),
  sendMessage: (id: string, text: string) =>
    request<{ conversation: Conversation }>(
      `/conversations/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: { text } },
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

  measurements: () => request<{ measurements: EventMeasurement[] }>("/measurements"),
  measurement: (eventId: string) =>
    request<{ metrics: Metrics; report: Report }>(`/measurements/${encodeURIComponent(eventId)}`),
  measurementLog: (eventId: string, kind?: MetricKind) =>
    request<{ entries: MetricEntry[] }>(`/measurements/${encodeURIComponent(eventId)}/log`, {
      query: kind ? { kind } : {},
    }),
  saveGoals: (
    eventId: string,
    goals: Pick<Report, "expectedAudience" | "averageSpend" | "snsReach" | "valueBreakdown" | "targets" | "coupon" | "staffPin">,
  ) =>
    request<{ metrics: Metrics; report: Report }>(`/measurements/${encodeURIComponent(eventId)}/goals`, {
      method: "PUT",
      body: goals,
    }),
  checkIn: (code: string) => request<CheckInInfo>(`/check-in/${encodeURIComponent(code)}`),
  // A scan answers a pass; the coupon sends it, and the visit sends it with
  // the staff PIN.
  recordCheckIn: (code: string, kind: MetricKind, body?: { pass: string; pin?: string }) =>
    request<{ entry: MetricEntry; pass?: string }>(`/check-in/${encodeURIComponent(code)}/${kind}`, {
      method: "POST",
      body,
    }),
}
