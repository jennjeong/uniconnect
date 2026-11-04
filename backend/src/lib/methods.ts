import { HttpError } from "./errors.js"
import type { ChatSide, EventSponsor, MeasureMethod, Measurement, MethodKind, MethodSide, VenueCounts } from "../types.js"

// 협찬을 행사에서 확인하는 방식(협찬 확인 방식). 전자계약서가 나열하는
// 순서다. frontend/src/data/methods.ts와 맞춰 둔다(lib/lists.sync.test.ts가
// 검사한다).
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

// 체크인 QR, 그 쿠폰, 매장 방문(참가자 휴대폰과 매장 페이지가 기록한다)
// 말고 방식마다 행사장 직원이 세는 것.
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

// 상자 단위(샘플, 물품)로 세고 나머지는 한 사람씩 센다.
export const bulkKinds: VenueKind[] = ["sampling", "giveaway"]

// 매장 방문은 브랜드의 매장에서 확인하므로 브랜드가 확인한다. 나머지는
// 전자계약서에 따라 어느 한쪽 또는 양쪽이다.
export const fixedSides: Partial<Record<MethodKind, MethodSide>> = { visit: "brand" }

// 방식이 함께 필요로 하는 것: 쿠폰은 QR 체크인 페이지에서 받고 매장 방문은
// 쿠폰 번호로 확인한다.
export const methodNeeds: Partial<Record<MethodKind, MethodKind>> = { coupon: "qr", visit: "coupon" }

// 양쪽이 전자계약서를 확인하기 전까지의 협찬 확인 방식: 방식이 생기기 전과
// 같이 체크인 QR, 그 쿠폰, 매장 방문이다.
export const defaultMethods: MeasureMethod[] = [
  { kind: "qr", side: "group" },
  { kind: "coupon", side: "brand" },
  { kind: "visit", side: "brand" },
]

// 전자계약서가 행사 한 몫에 정한 방식. 협찬사의 몫이거나 협찬사가 없을 때는
// 행사 자체의 몫이다.
export const methodsOf = (measurement: Measurement, sponsor?: EventSponsor) =>
  (sponsor ? sponsor.methods : measurement.methods) ?? defaultMethods

// 효력이 있는 방식: 양쪽이 전자계약서에서 마지막으로 확인한 것, 확인하기
// 전에는 기본값.
export const activeMethodsOf = (measurement: Measurement, sponsor?: EventSponsor) =>
  (sponsor ? sponsor.confirmedMethods : measurement.confirmedMethods) ?? defaultMethods

export const usesMethod = (methods: MeasureMethod[], kind: MethodKind) => methods.some((method) => method.kind === kind)

// 어느 쪽의 행사장 페이지가 방식을 확인하는지.
export const confirmsAt = (method: MeasureMethod, side: ChatSide) => method.side === side || method.side === "both"

const sides: MethodSide[] = ["group", "brand", "both"]

const sortMethods = (methods: MeasureMethod[]) =>
  methodKinds.flatMap((kind) => methods.filter((method) => method.kind === kind))

// 전자계약서가 정하는 방식: 알려진 종류를 한 번씩, 나열된 순서로 두고
// 각각 확인하는 쪽(매장 방문은 브랜드)을 붙인다. 쿠폰은 QR과 함께만,
// 매장 방문은 쿠폰과 함께만 둘 수 있다.
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

// 행사장 페이지가 한 번에 더하거나 되돌릴 수 있는 양: 샘플이나 물품은
// 한 상자, 나머지는 한 사람.
export function parseAmount(kind: VenueKind, value: unknown) {
  const amount = typeof value === "number" ? value : Number(value ?? 1)
  const bulk = bulkKinds.includes(kind)
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > (bulk ? 500 : 1)) {
    throw new HttpError(400, bulk ? "수량은 1부터 500까지 적어 주세요." : "한 번에 하나씩 기록해 주세요.")
  }
  return amount
}

// 방식이 나뉘기 전에 저장된 방식. 그때는 쿠폰이 QR, 쿠폰, 매장 방문을
// 함께 뜻했다.
export function upgradeMethods(methods: MeasureMethod[] | undefined) {
  if (!methods || !usesMethod(methods, "coupon") || usesMethod(methods, "qr")) return methods
  return sortMethods([
    ...methods.filter((method) => method.kind !== "coupon"),
    ...defaultMethods.filter((method) => !usesMethod(methods, method.kind) || method.kind === "coupon"),
  ])
}

// 한 몫의 행사장 집계. 각각 0에서 시작한다.
export const emptyVenueCounts = (): VenueCounts =>
  Object.fromEntries(venueMetricKeys.map((metric) => [metric, 0])) as VenueCounts

export const venueCountsOf = (counts: VenueCounts): VenueCounts =>
  Object.fromEntries(venueMetricKeys.map((metric) => [metric, counts[metric] ?? 0])) as VenueCounts
