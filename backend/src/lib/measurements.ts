import { randomBytes, randomUUID } from "node:crypto"

import { HttpError } from "./errors.js"
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
