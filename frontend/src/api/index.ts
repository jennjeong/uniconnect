import type {
  Account,
  EventItem,
  Match,
  MetricKind,
  Metrics,
  Role,
  Session,
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

export type EventDraft = Pick<EventItem, "name" | "people" | "date" | "types">

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

  events: (role: Role) =>
    request<{ events: EventItem[] }>("/events", { query: { role } }),
  createEvent: (body: EventDraft) =>
    request<{ event: EventItem }>("/events", { method: "POST", body }),
  deleteEvent: (id: string) =>
    request<void>(`/events/${encodeURIComponent(id)}`, { method: "DELETE" }),

  proposals: () => request<{ proposals: string[] }>("/proposals"),
  propose: (matchId: string) =>
    request<{ proposals: string[] }>("/proposals", {
      method: "POST",
      body: { matchId },
    }),
  cancelProposal: (matchId: string) =>
    request<{ proposals: string[] }>(`/proposals/${encodeURIComponent(matchId)}`, {
      method: "DELETE",
    }),

  metrics: () => request<{ metrics: Metrics }>("/metrics"),
  recordMetric: (kind: MetricKind) =>
    request<{ metrics: Metrics }>(`/metrics/${kind}`, { method: "POST" }),
}
