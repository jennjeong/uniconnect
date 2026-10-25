import { HttpError } from "./errors.js"
import type { ChatSide, EventSponsor, MeasureMethod, Measurement, MethodKind } from "../types.js"

// The ways a sponsorship can be measured at the event, in the order the
// agreement lists them. Keep in sync with frontend/src/data/methods.ts
// (lib/lists.sync.test.ts checks).
export const methodKinds: MethodKind[] = ["coupon", "sampling", "booth", "sns"]

// What the venue's staff count for each method beyond the coupon: samples
// or tastings handed out, booth visits stamped, SNS posts or surveys checked.
export const venueMetrics = { sampling: "samples", booth: "stamps", sns: "posts" } as const

export type VenueKind = keyof typeof venueMetrics
export type VenueMetric = (typeof venueMetrics)[VenueKind]

export const isVenueKind = (kind: MethodKind): kind is VenueKind => kind !== "coupon"

// Store visits are confirmed at the brand's store, so the coupon is always
// the brand's to confirm; the others are up to the agreement.
export const fixedSides: Partial<Record<MethodKind, ChatSide>> = { coupon: "brand" }

// How a sponsorship is measured until its agreement says otherwise: the
// check-in QR's coupon and the store's visits, as before methods existed.
export const defaultMethods: MeasureMethod[] = [{ kind: "coupon", side: "brand" }]

// The methods of one share of an event: a sponsor's own, or the event's
// while it has no sponsors.
export const methodsOf = (measurement: Measurement, sponsor?: EventSponsor) =>
  (sponsor ? sponsor.methods : measurement.methods) ?? defaultMethods

export const usesCoupon = (methods: MeasureMethod[]) => methods.some((method) => method.kind === "coupon")

const sides: ChatSide[] = ["group", "brand"]

// The methods an agreement sets: known kinds, each once, in the listed
// order, each with the side that confirms it (the coupon always the brand).
export function parseMethods(input: unknown): MeasureMethod[] {
  if (!Array.isArray(input)) throw new HttpError(400, "측정 방식을 다시 확인해 주세요.")
  const methods = input.map((raw) => {
    const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const kind = methodKinds.find((item) => item === value.kind)
    if (!kind) throw new HttpError(400, "측정 방식을 다시 확인해 주세요.")
    const side = sides.find((item) => item === value.side)
    if (!side) throw new HttpError(400, "방식마다 현장에서 확인할 쪽을 골라 주세요.")
    if (fixedSides[kind] && fixedSides[kind] !== side) {
      throw new HttpError(400, "매장 방문은 브랜드 매장에서만 확인할 수 있어요.")
    }
    return { kind, side }
  })
  if (methods.length === 0) throw new HttpError(400, "측정 방식을 하나 이상 골라 주세요.")
  if (new Set(methods.map((method) => method.kind)).size !== methods.length) {
    throw new HttpError(400, "같은 측정 방식을 두 번 고를 수 없어요.")
  }
  return methodKinds.flatMap((kind) => methods.filter((method) => method.kind === kind))
}

// How many a venue page may add or take back at once: a box of samples, or
// one stamp or post at a time.
export function parseAmount(kind: VenueKind, value: unknown) {
  const amount = typeof value === "number" ? value : Number(value ?? 1)
  const most = kind === "sampling" ? 500 : 1
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > most) {
    throw new HttpError(400, kind === "sampling" ? "수량은 1부터 500까지 적어 주세요." : "한 번에 하나씩 기록해 주세요.")
  }
  return amount
}
