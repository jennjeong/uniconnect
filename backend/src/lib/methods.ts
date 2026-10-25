import { HttpError } from "./errors.js"
import type { ChatSide, EventSponsor, MeasureMethod, Measurement, MethodKind, MethodSide, VenueCounts } from "../types.js"

// The ways a sponsorship can be confirmed at the event (협찬 확인 방식), in
// the order the e-contract lists them. Keep in sync with
// frontend/src/data/methods.ts (lib/lists.sync.test.ts checks).
export const methodKinds: MethodKind[] = [
  "qr",
  "coupon",
  "visit",
  "sampling",
  "booth",
  "sns",
  "survey",
  "purchase",
  "giveaway",
  "raffle",
  "signup",
  "experience",
]

// What the venue's staff count for each method beyond the check-in QR, its
// coupon and the store's visits, which the participants' phones and the
// store's page record.
export const venueMetrics = {
  sampling: "samples",
  booth: "stamps",
  sns: "posts",
  survey: "surveys",
  purchase: "purchases",
  giveaway: "giveaways",
  raffle: "raffles",
  signup: "signups",
  experience: "experiences",
} as const satisfies Record<string, keyof VenueCounts>

export type VenueKind = keyof typeof venueMetrics
export type VenueMetric = (typeof venueMetrics)[VenueKind]

export const venueMetricKeys = Object.values(venueMetrics) as VenueMetric[]

export const isVenueKind = (kind: MethodKind): kind is VenueKind =>
  Object.prototype.hasOwnProperty.call(venueMetrics, kind)

// Counted by the box (samples, goods); the rest one person at a time.
export const bulkKinds: VenueKind[] = ["sampling", "giveaway"]

// Store visits are confirmed at the brand's store, so they are the brand's
// to confirm; the others are up to the e-contract, either side or both.
export const fixedSides: Partial<Record<MethodKind, MethodSide>> = { visit: "brand" }

// What a method needs beside it: the coupon is taken on the QR's check-in
// page, and a store visit is confirmed by the coupon's number.
export const methodNeeds: Partial<Record<MethodKind, MethodKind>> = { coupon: "qr", visit: "coupon" }

// How a sponsorship is confirmed until both sides confirm their e-contract:
// the check-in QR, its coupon and the store's visits, as before methods.
export const defaultMethods: MeasureMethod[] = [
  { kind: "qr", side: "group" },
  { kind: "coupon", side: "brand" },
  { kind: "visit", side: "brand" },
]

// The methods an e-contract sets for one share of an event: a sponsor's,
// or the event's own while it has no sponsors.
export const methodsOf = (measurement: Measurement, sponsor?: EventSponsor) =>
  (sponsor ? sponsor.methods : measurement.methods) ?? defaultMethods

// The methods that count: those both sides last confirmed on the
// e-contract, or the default until they have.
export const activeMethodsOf = (measurement: Measurement, sponsor?: EventSponsor) =>
  (sponsor ? sponsor.confirmedMethods : measurement.confirmedMethods) ?? defaultMethods

export const usesMethod = (methods: MeasureMethod[], kind: MethodKind) => methods.some((method) => method.kind === kind)

// Whether a side's venue page confirms a method.
export const confirmsAt = (method: MeasureMethod, side: ChatSide) => method.side === side || method.side === "both"

const sides: MethodSide[] = ["group", "brand", "both"]

const sortMethods = (methods: MeasureMethod[]) =>
  methodKinds.flatMap((kind) => methods.filter((method) => method.kind === kind))

// The methods an e-contract sets: known kinds, each once, in the listed
// order, each with the side that confirms it (store visits the brand's),
// and the coupon only with the QR, store visits only with the coupon.
export function parseMethods(input: unknown): MeasureMethod[] {
  if (!Array.isArray(input)) throw new HttpError(400, "협찬 확인 방식을 다시 확인해 주세요.")
  const methods = input.map((raw) => {
    const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const kind = methodKinds.find((item) => item === value.kind)
    if (!kind) throw new HttpError(400, "협찬 확인 방식을 다시 확인해 주세요.")
    const side = sides.find((item) => item === value.side)
    if (!side) throw new HttpError(400, "방식마다 현장에서 확인할 쪽을 골라 주세요.")
    if (fixedSides[kind] && fixedSides[kind] !== side) {
      throw new HttpError(400, "매장 방문은 브랜드 매장에서만 확인할 수 있어요.")
    }
    return { kind, side }
  })
  if (methods.length === 0) throw new HttpError(400, "협찬 확인 방식을 하나 이상 골라 주세요.")
  if (new Set(methods.map((method) => method.kind)).size !== methods.length) {
    throw new HttpError(400, "같은 협찬 확인 방식을 두 번 고를 수 없어요.")
  }
  if (usesMethod(methods, "coupon") && !usesMethod(methods, "qr")) {
    throw new HttpError(400, "쿠폰 발급은 QR 체크인과 함께 골라 주세요.")
  }
  if (usesMethod(methods, "visit") && !usesMethod(methods, "coupon")) {
    throw new HttpError(400, "매장 방문은 쿠폰 발급과 함께 골라 주세요.")
  }
  return sortMethods(methods)
}

// How many a venue page may add or take back at once: a box of samples or
// goods, else one person at a time.
export function parseAmount(kind: VenueKind, value: unknown) {
  const amount = typeof value === "number" ? value : Number(value ?? 1)
  const bulk = bulkKinds.includes(kind)
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > (bulk ? 500 : 1)) {
    throw new HttpError(400, bulk ? "수량은 1부터 500까지 적어 주세요." : "한 번에 하나씩 기록해 주세요.")
  }
  return amount
}

// Methods saved before they were split: the coupon then stood for the QR,
// the coupon and the store's visits together.
export function upgradeMethods(methods: MeasureMethod[] | undefined) {
  if (!methods || !usesMethod(methods, "coupon") || usesMethod(methods, "qr")) return methods
  return sortMethods([
    ...methods.filter((method) => method.kind !== "coupon"),
    ...defaultMethods.filter((method) => !usesMethod(methods, method.kind) || method.kind === "coupon"),
  ])
}

// A share's venue counts, each from 0.
export const emptyVenueCounts = (): VenueCounts =>
  Object.fromEntries(venueMetricKeys.map((metric) => [metric, 0])) as VenueCounts

export const venueCountsOf = (counts: VenueCounts): VenueCounts =>
  Object.fromEntries(venueMetricKeys.map((metric) => [metric, counts[metric] ?? 0])) as VenueCounts
