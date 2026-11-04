import { randomBytes, randomInt, randomUUID } from "node:crypto"

import { addDays, hourInKorea, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { activeMethodsOf, emptyVenueCounts, venueCountsOf } from "./methods.js"
import { sponsorTypes, text } from "./validation.js"
import type {
  Database,
  EventItem,
  EventSponsor,
  Measurement,
  MeasurementGoals,
  MetricEntry,
  MetricKind,
  Report,
} from "../types.js"

export const metricKinds: MetricKind[] = [
  "scans",
  "coupons",
  "visits",
  "samples",
  "stamps",
  "posts",
  "surveys",
  "purchases",
  "giveaways",
  "raffles",
  "signups",
  "experiences",
]

// What a participant's phone records on the check-in page.
export const checkInKinds: MetricKind[] = ["scans", "coupons", "visits"]

export const emptyMetrics = (): Measurement["metrics"] => ({ scans: 0, coupons: 0, visits: 0, ...emptyVenueCounts() })

export function parseKind(value: unknown, kinds = metricKinds) {
  const kind = kinds.find((item) => item === value)
  if (!kind) throw new HttpError(404, "알 수 없는 측정 항목이에요.")
  return kind
}

// Only the most recent records are kept; the counts stay exact.
const logLimit = 300

// "120명" → 120; a guess of 100 when the event gives no number. Kept within
// what the goals form takes, so the default goals save as they are.
function audienceOf(event: EventItem) {
  const people = Number(event.people?.replace(/[^\d]/g, ""))
  return people > 0 ? Math.min(people, 100_000) : 100
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
      roas: wholeNumber(targets.roas, "목표 ROAS", 10_000, 1),
    },
    coupon: { store, title },
  }
}

// Each sponsor's coupon, value and staff PIN from the goals form, checked
// and applied to the measurement. Values, when there are several sponsors,
// must add up to the event's value; PINs must differ between sponsors.
export function applySponsorGoals(measurement: Measurement, goals: MeasurementGoals, body: unknown) {
  const total = goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  const several = measurement.sponsors.length > 1
  if (Array.isArray(body)) {
    const rows = body as Record<string, unknown>[]
    const updates = measurement.sponsors.map((sponsor) => {
      const row = rows.find((item) => item?.id === sponsor.id)
      if (!row) throw new HttpError(400, `${sponsor.brandName}의 쿠폰을 적어 주세요.`)
      const store = text(row.store)
      const title = text(row.title)
      if (!store || store.length > 30 || !title || title.length > 30) {
        throw new HttpError(400, "쿠폰의 매장과 혜택을 30자 이하로 적어 주세요.")
      }
      return {
        sponsor,
        coupon: { store, title },
        value: several ? wholeNumber(row.value, `${sponsor.brandName}의 협찬 가치`, 1_000_000_000) : undefined,
        staffPin: parseStaffPin(row.staffPin) ?? sponsor.staffPin,
      }
    })
    if (new Set(updates.map((update) => update.staffPin)).size !== updates.length) {
      throw new HttpError(400, "직원 확인 PIN은 협찬사마다 다르게 정해 주세요.")
    }
    if (several && updates.reduce((sum, update) => sum + (update.value ?? 0), 0) !== total) {
      throw new HttpError(400, `협찬사별 가치를 더하면 협찬 가치 합계(${total.toLocaleString("ko-KR")}원)와 같아야 해요.`)
    }
    for (const update of updates) {
      update.sponsor.coupon = update.coupon
      update.sponsor.staffPin = update.staffPin
      if (update.value !== undefined) update.sponsor.value = update.value
    }
    return
  }
  // Without them, the event's value must still add up with what was set.
  const set = measurement.sponsors.filter((sponsor) => sponsor.value !== undefined)
  if (several && set.length === measurement.sponsors.length && set.reduce((sum, item) => sum + item.value!, 0) !== total) {
    throw new HttpError(400, `협찬사별 가치를 더하면 협찬 가치 합계(${total.toLocaleString("ko-KR")}원)와 같아야 해요.`)
  }
}

// The staff PIN, when the goals form sends one: 4 digits.
export function parseStaffPin(value: unknown) {
  if (value === undefined) return undefined
  const pin = text(value)
  if (!/^\d{4}$/.test(pin)) throw new HttpError(400, "직원 확인 PIN은 숫자 4자리로 적어 주세요.")
  return pin
}

// A check-in code no other event has.
function newCode(database: Database) {
  let code: string
  do code = randomBytes(4).toString("hex")
  while (database.measurements.some((measurement) => measurement.code === code))
  return code
}

export const newStaffPin = () => String(randomInt(0, 10000)).padStart(4, "0")

// A PIN none of the event's sponsors has, so a PIN tells whose store it is.
function newSponsorPin(measurement: Measurement) {
  let pin: string
  do pin = newStaffPin()
  while (measurement.sponsors.some((sponsor) => sponsor.staffPin === pin))
  return pin
}

// Gives each brand sponsoring the event its own coupon, staff PIN and counts
// on the event's measurement. The event's first sponsor takes over what the
// event had so far, when it is the only one: the coupon, the PIN, the counts
// and the coupon numbers already handed out. A later sponsor starts from
// zero with a coupon named after the brand, and the event's value goes back
// to an even split until the group sets each share again. Returns whether
// any was added.
export function syncSponsors(database: Database, measurement: Measurement) {
  const sponsorships = Object.entries(database.sponsorships).flatMap(([brandAccountId, list]) =>
    list
      .filter((sponsorship) => sponsorship.eventId === measurement.eventId)
      .map((sponsorship) => ({ brandAccountId, sponsorship })),
  )
  const missing = sponsorships.filter(
    ({ sponsorship }) => !measurement.sponsors.some((sponsor) => sponsor.id === sponsorship.id),
  )
  if (missing.length === 0) return false
  const takesOver = measurement.sponsors.length === 0 && sponsorships.length === 1
  for (const { brandAccountId, sponsorship } of missing) {
    const brandName =
      database.accounts.find((account) => account.id === brandAccountId)?.name ?? "협찬사"
    const { scans: _, ...counts } = measurement.metrics
    const sponsor: EventSponsor = takesOver
      ? {
          id: sponsorship.id,
          brandName,
          coupon: { ...measurement.goals.coupon },
          staffPin: measurement.staffPin,
          metrics: counts,
          ...(measurement.methods ? { methods: measurement.methods } : {}),
          ...(measurement.confirmedMethods ? { confirmedMethods: measurement.confirmedMethods } : {}),
        }
      : {
          id: sponsorship.id,
          brandName,
          coupon: { store: brandName, title: "참여자 전용 혜택" },
          staffPin: newSponsorPin(measurement),
          metrics: { coupons: 0, visits: 0, ...emptyVenueCounts() },
        }
    if (takesOver) {
      for (const pass of Object.values(measurement.passes)) {
        if (!pass.coupon) continue
        pass.sponsors = { [sponsor.id]: { coupon: pass.coupon, ...(pass.visit ? { visit: true as const } : {}) } }
        delete pass.coupon
        delete pass.visit
      }
    }
    measurement.sponsors.push(sponsor)
  }
  for (const sponsor of measurement.sponsors) delete sponsor.value
  return true
}

// Won a sponsor gave: the whole value when it is the only one, else what the
// group set for it, or an even split until it has.
export function shareValue(measurement: Measurement, sponsor: EventSponsor) {
  const total = measurement.goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  if (measurement.sponsors.length <= 1) return total
  return sponsor.value ?? Math.round(total / measurement.sponsors.length)
}

// The event's measurement, created with default goals the first time, with
// a share for each sponsor. Returns whether anything changed, so the caller
// knows to save.
export function ensureMeasurement(database: Database, accountId: string, event: EventItem) {
  const found = database.measurements.find((measurement) => measurement.eventId === event.id)
  if (found) return { measurement: found, created: syncSponsors(database, found) }
  const measurement: Measurement = {
    eventId: event.id,
    accountId,
    code: newCode(database),
    metrics: emptyMetrics(),
    hourlyScans: [],
    log: [],
    goals: defaultGoals(event),
    staffPin: newStaffPin(),
    groupPin: newStaffPin(),
    sponsors: [],
    passes: {},
  }
  database.measurements.push(measurement)
  syncSponsors(database, measurement)
  return { measurement, created: true }
}

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

// Estimated sales at the sponsor's store from the visits so far.
export const estimatedSales = (measurement: Measurement) =>
  measurement.metrics.visits * measurement.goals.averageSpend

// The event's report: its goals, with reach and ROAS worked out from the
// live counts (reach: QR scans plus the reach beyond the venue; ROAS:
// estimated sales over the sponsorship's value), how it is confirmed (as
// both sides confirmed it) and what the venue confirmed. The PINs go only to the event's owner, the
// group's venue PIN only when the owner is the group.
export function buildReport(
  measurement: Measurement,
  event: EventItem,
  { withPin = false, withGroupPin = false, pinsDay = "" } = {},
): Report {
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
    ...(withPin ? { staffPin: measurement.staffPin } : {}),
    ...(withGroupPin ? { groupPin: measurement.groupPin } : {}),
    ...(pinsDay ? { pinsFrom: pinsDay } : {}),
    methods: activeMethodsOf(measurement),
    venue: venueCountsOf(metrics),
    // Who came, for the students' own report: the kind of event, who was
    // expected, and the optional survey's counts once anyone answered.
    ...(event.kind ? { eventKind: event.kind } : {}),
    ...(event.makeup ? { makeup: event.makeup } : {}),
    ...(measurement.survey && measurement.survey.responses > 0 ? { survey: measurement.survey } : {}),
    ...(measurement.sponsors.length
      ? {
          sponsors: measurement.sponsors.map((sponsor) => {
            const value = shareValue(measurement, sponsor)
            return {
              id: sponsor.id,
              brandName: sponsor.brandName,
              coupon: sponsor.coupon,
              value,
              coupons: sponsor.metrics.coupons,
              visits: sponsor.metrics.visits,
              roas: percent(sponsor.metrics.visits * goals.averageSpend, value),
              methods: activeMethodsOf(measurement, sponsor),
              ...venueCountsOf(sponsor.metrics),
              ...(withPin ? { staffPin: sponsor.staffPin } : {}),
            }
          }),
        }
      : {}),
  }
}

// When an event takes check-ins, in days in Korea: scans and coupons on its
// own days and the day after (for events running past midnight), store
// visits until the coupons run out, 7 days after the last coupon. The demo
// accounts' events are always open, so visitors can try the flow.
export const couponDays = 7

export function checkInWindow(event: EventItem) {
  const end = addDays(event.endDate ?? event.date, 1)
  return { start: event.date, end, visitsEnd: addDays(end, couponDays) }
}

export const isDemoEvent = (database: Database, measurement: Measurement) =>
  Object.values(database.demoAccountIds).includes(measurement.accountId)

// The day an event's PINs start to show to those who run it: the day before
// it begins; the demo accounts' show at once, for visitors to try the flow.
export const pinsFrom = (event: EventItem) => addDays(event.date, -1)

export const pinsOpen = (database: Database, measurement: Measurement, event: EventItem) =>
  isDemoEvent(database, measurement) || pinsFrom(event) <= todayInKorea()

// The most scans an event counts, so a QR passed around can't inflate its
// reach far past what the event expected: three times its audience, at least
// 100, whatever the demo accounts' visitors try.
export const scanCeiling = (database: Database, measurement: Measurement) =>
  isDemoEvent(database, measurement) ? Infinity : Math.max(100, measurement.goals.expectedAudience * 3)

// Refuses a scan or coupon outside the event's days, or a visit after its
// coupons ran out.
export function assertOpen(database: Database, measurement: Measurement, event: EventItem, kind: MetricKind) {
  if (isDemoEvent(database, measurement)) return
  const today = todayInKorea()
  const { start, end, visitsEnd } = checkInWindow(event)
  if (kind === "visits") {
    if (today > visitsEnd) throw new HttpError(409, "쿠폰 사용 기간이 지났어요.")
    return
  }
  if (today < start) {
    throw new HttpError(409, `아직 참여를 받지 않는 행사예요. 행사 당일(${start})에 다시 스캔해 주세요.`)
  }
  if (today > end) throw new HttpError(409, "참여 기간이 끝난 행사예요.")
}

// Participation records a measurement keeps at most: far above any campus
// event, low enough to keep the data file small.
export const passLimit = 20_000

// Drops the participation records an event no longer needs: those without
// a coupon once its days are over, and all of them once its coupons ran
// out. Returns whether any went.
export function prunePasses(database: Database, measurement: Measurement, event: EventItem) {
  if (isDemoEvent(database, measurement)) return false
  const today = todayInKorea()
  const { end, visitsEnd } = checkInWindow(event)
  if (today <= end) return false
  const before = Object.keys(measurement.passes).length
  if (today > visitsEnd) {
    measurement.passes = {}
  } else {
    measurement.passes = Object.fromEntries(
      Object.entries(measurement.passes).filter(
        ([, pass]) => pass.coupon || Object.keys(pass.sponsors ?? {}).length > 0,
      ),
    )
  }
  return Object.keys(measurement.passes).length !== before
}

// What the venue's staff confirm, as the records name it.
const venueDetails: Partial<Record<MetricKind, string>> = {
  samples: "샘플링 · 시음",
  stamps: "부스 방문 · 스탬프",
  posts: "SNS 인증",
  surveys: "설문 응답",
  purchases: "현장 구매 · 영수증",
  giveaways: "굿즈 · 사은품 지급",
  raffles: "경품 응모 · 추첨",
  signups: "회원 가입 · 앱 설치",
  experiences: "체험 · 시연 참여",
}

// Counted by the box rather than by the person.
const countedByBox: MetricKind[] = ["samples", "giveaways"]

// Counts one QR scan, coupon or store visit, or what the venue confirmed
// (`amount` samples, one stamp or post, or fewer to correct a mistake), and
// its record; a sponsor's count grows with the event's.
export function recordMetric(
  measurement: Measurement,
  kind: MetricKind,
  sponsor?: EventSponsor,
  amount = 1,
): MetricEntry {
  measurement.metrics[kind] += amount
  if (sponsor && kind !== "scans") sponsor.metrics[kind] += amount
  const now = new Date()
  if (kind === "scans") {
    // Hours on the clock in Korea, where the events take place, by day.
    const { date, hour } = hourInKorea(now)
    const slot = measurement.hourlyScans.find((item) => item.date === date && item.hour === hour)
    if (slot) slot.scans += 1
    else {
      measurement.hourlyScans = [...measurement.hourlyScans, { date, hour, scans: 1 }].sort(
        (a, b) => a.date.localeCompare(b.date) || a.hour - b.hour,
      )
    }
  }
  const coupon = sponsor?.coupon ?? measurement.goals.coupon
  const entry: MetricEntry = {
    id: randomUUID(),
    kind,
    at: now.toISOString(),
    participant:
      amount < 0 ? `정정 ${amount}` : countedByBox.includes(kind) ? `${amount}개` : `참여자 #${measurement.metrics[kind]}`,
    detail:
      venueDetails[kind] ?? (kind === "scans" ? "현장 QR 스캔" : kind === "coupons" ? coupon.title : coupon.store),
  }
  measurement.log = [...measurement.log, entry].slice(-logLimit)
  return entry
}

// The event a measurement belongs to, with its owner's account id.
export function eventOf(database: Database, measurement: Measurement) {
  return database.events[measurement.accountId]?.find((event) => event.id === measurement.eventId)
}
