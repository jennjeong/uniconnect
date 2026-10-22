import { randomBytes, randomUUID } from "node:crypto"

import { HttpError } from "./errors.js"
import { sponsorTypes, text } from "./validation.js"
import type {
  Database,
  EventItem,
  Measurement,
  MeasurementGoals,
  MetricEntry,
  MetricKind,
  Report,
} from "../types.js"

export const metricKinds: MetricKind[] = ["scans", "coupons", "visits"]

export function parseKind(value: unknown) {
  const kind = metricKinds.find((item) => item === value)
  if (!kind) throw new HttpError(404, "알 수 없는 측정 항목이에요.")
  return kind
}

// Only the most recent records are kept; the counts stay exact.
const logLimit = 300

// "120명" → 120; a guess of 100 when the event gives no number.
function audienceOf(event: EventItem) {
  const people = Number(event.people?.replace(/[^\d]/g, ""))
  return people > 0 ? people : 100
}

// Goals a new event starts from, scaled to its expected audience; the group
// sets its own from the measurement page.
export function defaultGoals(event: EventItem): MeasurementGoals {
  const audience = audienceOf(event)
  return {
    expectedAudience: audience,
    averageSpend: 10000,
    snsReach: 0,
    valueBreakdown: [],
    targets: {
      reach: audience * 3,
      scans: Math.round(audience * 0.6),
      coupons: Math.round(audience * 0.4),
      visits: Math.round(audience * 0.15),
      qrRate: 60,
      visitRate: 25,
      roas: 150,
    },
    coupon: { store: "협찬 매장", title: "참여자 전용 혜택" },
  }
}

// "예상 인원은", "협찬 가치는": 은 after a final consonant.
function topic(label: string) {
  const syllable = label.charCodeAt(label.length - 1) - 0xac00
  return `${label}${syllable >= 0 && syllable < 11172 && syllable % 28 !== 0 ? "은" : "는"}`
}

// A whole number from `min` to `max`, or a Korean error naming the field.
function wholeNumber(value: unknown, label: string, max: number, min = 0) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""))
  if (!Number.isInteger(number) || number < min || number > max) {
    const range = `${min.toLocaleString("ko-KR")}부터 ${max.toLocaleString("ko-KR")}까지`
    throw new HttpError(400, `${topic(label)} ${range}의 숫자로 적어 주세요.`)
  }
  return number
}

// Goals the group sets from the measurement page, checked field by field.
export function parseGoals(body: unknown): MeasurementGoals {
  const input = (body ?? {}) as Record<string, unknown>
  const targets = (input.targets ?? {}) as Record<string, unknown>
  const coupon = (input.coupon ?? {}) as Record<string, unknown>
  const rows = (Array.isArray(input.valueBreakdown) ? input.valueBreakdown : []) as Record<string, unknown>[]
  const valueBreakdown = rows
    .map((row) => ({ type: text(row?.type), value: wholeNumber(row?.value, "협찬 가치", 1_000_000_000) }))
    .filter((row) => row.value > 0)
  if (valueBreakdown.length > 6) throw new HttpError(400, "협찬 가치는 6개까지 적을 수 있어요.")
  if (valueBreakdown.some((row) => !sponsorTypes.includes(row.type))) {
    throw new HttpError(400, "협찬 종류를 골라 주세요.")
  }
  const store = text(coupon.store)
  const title = text(coupon.title)
  if (!store || store.length > 30 || !title || title.length > 30) {
    throw new HttpError(400, "쿠폰의 매장과 혜택을 30자 이하로 적어 주세요.")
  }
  return {
    expectedAudience: wholeNumber(input.expectedAudience, "예상 인원", 100_000, 1),
    averageSpend: wholeNumber(input.averageSpend, "1인 예상 지출", 10_000_000),
    snsReach: wholeNumber(input.snsReach, "현장 밖 도달", 10_000_000),
    valueBreakdown,
    targets: {
      reach: wholeNumber(targets.reach, "목표 도달", 10_000_000),
      scans: wholeNumber(targets.scans, "목표 QR 스캔", 1_000_000),
      coupons: wholeNumber(targets.coupons, "목표 쿠폰 수령", 1_000_000),
      visits: wholeNumber(targets.visits, "목표 매장 방문", 1_000_000),
      qrRate: wholeNumber(targets.qrRate, "목표 QR 참여율", 100),
      visitRate: wholeNumber(targets.visitRate, "목표 방문 전환율", 100),
      roas: wholeNumber(targets.roas, "목표 ROAS", 10_000),
    },
    coupon: { store, title },
  }
}

// A check-in code no other event has.
function newCode(database: Database) {
  let code: string
  do code = randomBytes(4).toString("hex")
  while (database.measurements.some((measurement) => measurement.code === code))
  return code
}

// The event's measurement, created with default goals the first time.
// Returns whether it was created, so the caller knows to save.
export function ensureMeasurement(database: Database, accountId: string, event: EventItem) {
  const found = database.measurements.find((measurement) => measurement.eventId === event.id)
  if (found) return { measurement: found, created: false }
  const measurement: Measurement = {
    eventId: event.id,
    accountId,
    code: newCode(database),
    metrics: { scans: 0, coupons: 0, visits: 0 },
    hourlyScans: [],
    log: [],
    goals: defaultGoals(event),
  }
  database.measurements.push(measurement)
  return { measurement, created: true }
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// Estimated sales at the sponsor's store from the visits so far.
export const estimatedSales = (measurement: Measurement) =>
  measurement.metrics.visits * measurement.goals.averageSpend

// The event's report: its goals, with reach and ROAS worked out from the
// live counts (reach: QR scans plus the reach beyond the venue; ROAS:
// estimated sales over the sponsorship's value).
export function buildReport(measurement: Measurement, event: EventItem): Report {
  const { goals, metrics } = measurement
  const sponsorValue = goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  return {
    eventId: event.id,
    code: measurement.code,
    eventName: event.name,
    eventDate: event.date,
    ...(event.endDate ? { eventEndDate: event.endDate } : {}),
    expectedAudience: goals.expectedAudience,
    sponsorValue,
    reach: metrics.scans + goals.snsReach,
    roas: percent(estimatedSales(measurement), sponsorValue),
    targets: goals.targets,
    hourlyScans: measurement.hourlyScans,
    valueBreakdown: goals.valueBreakdown,
    averageSpend: goals.averageSpend,
    snsReach: goals.snsReach,
    coupon: goals.coupon,
  }
}

// Counts one QR scan, coupon or store visit, and its record.
export function recordMetric(measurement: Measurement, kind: MetricKind): MetricEntry {
  measurement.metrics[kind] += 1
  const now = new Date()
  if (kind === "scans") {
    // Hours on the clock in Korea, where the events take place.
    const hour = new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCHours()
    const slot = measurement.hourlyScans.find((item) => item.hour === hour)
    if (slot) slot.scans += 1
    else measurement.hourlyScans = [...measurement.hourlyScans, { hour, scans: 1 }].sort((a, b) => a.hour - b.hour)
  }
  const { coupon } = measurement.goals
  const entry: MetricEntry = {
    id: randomUUID(),
    kind,
    at: now.toISOString(),
    participant: `참여자 #${measurement.metrics[kind]}`,
    detail: kind === "scans" ? "현장 QR 스캔" : kind === "coupons" ? coupon.title : coupon.store,
  }
  measurement.log = [...measurement.log, entry].slice(-logLimit)
  return entry
}

// The event a measurement belongs to, with its owner's account id.
export function eventOf(database: Database, measurement: Measurement) {
  return database.events[measurement.accountId]?.find((event) => event.id === measurement.eventId)
}
