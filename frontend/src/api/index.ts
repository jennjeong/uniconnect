import type {
  Account,
  Conversation,
  EventItem,
  Match,
  MetricEntry,
  MetricKind,
  Metrics,
  ProfileDraft,
  Report,
  RequestStatus,
  Role,
  Session,
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
  "name" | "people" | "date" | "types" | "typeNote" | "budget"
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

  metrics: () => request<{ metrics: Metrics }>("/metrics"),
  metricLog: (kind?: MetricKind) =>
    request<{ entries: MetricEntry[] }>("/metrics/log", { query: kind ? { kind } : {} }),
  recordMetric: (kind: MetricKind) =>
    request<{ metrics: Metrics; entry: MetricEntry }>(`/metrics/${kind}`, { method: "POST" }),

  report: () => request<{ report: Report }>("/report"),
}
