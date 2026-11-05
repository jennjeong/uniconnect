import { randomBytes, randomInt, randomUUID } from "node:crypto"

import { addDays, hourInKorea, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { activeMethodsOf, emptyVenueCounts, venueCountsOf } from "./methods.js"
import { sponsorTypes, text } from "./validation.js"
import type {
  Database,
  EventItem,
  ChatSide,
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

// 참가자의 휴대폰이 체크인 페이지에서 기록하는 내용.
export const checkInKinds: MetricKind[] = ["scans", "coupons", "visits"]

export const emptyMetrics = (): Measurement["metrics"] => ({ scans: 0, coupons: 0, visits: 0, ...emptyVenueCounts() })

export function parseKind(value: unknown, kinds = metricKinds) {
  const kind = kinds.find((item) => item === value)
  if (!kind) throw new HttpError(404, "알 수 없는 측정 항목이에요.")
  return kind
}

// 최근 기록만 남기고 집계 숫자는 정확히 유지한다.
const logLimit = 300

// "120명" → 120. 행사에 숫자가 없으면 100으로 짐작한다. 목표 폼이 받는
// 범위 안으로 맞춰서 기본 목표가 그대로 저장되게 한다.
function audienceOf(event: EventItem) {
  const people = Number(event.people?.replace(/[^\d]/g, ""))
  return people > 0 ? Math.min(people, 100_000) : 100
}

// 새 행사가 시작하는 목표. 예상 인원에 맞춰 크기를 정하며 단체는 측정
// 페이지에서 직접 바꾼다.
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

// "예상 인원은", "협찬 가치는": 받침 뒤에는 '은'을 쓴다.
function topic(label: string) {
  const syllable = label.charCodeAt(label.length - 1) - 0xac00
  return `${label}${syllable >= 0 && syllable < 11172 && syllable % 28 !== 0 ? "은" : "는"}`
}

// `min`부터 `max`까지의 정수. 아니면 필드 이름을 넣은 한국어 오류를 낸다.
function wholeNumber(value: unknown, label: string, max: number, min = 0) {
  const number = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""))
  if (!Number.isInteger(number) || number < min || number > max) {
    const range = `${min.toLocaleString("ko-KR")}부터 ${max.toLocaleString("ko-KR")}까지`
    throw new HttpError(400, `${topic(label)} ${range}의 숫자로 적어 주세요.`)
  }
  return number
}

// 단체가 측정 페이지에서 정하는 목표. 필드마다 검사한다.
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

// 목표 폼의 협찬사별 쿠폰, 가치, 직원 PIN을 검사해 측정에 반영한다.
// 협찬사가 여럿이면 가치의 합이 행사의 가치와 같아야 하고 PIN은 협찬사마다
// 달라야 한다.
export function applySponsorGoals(measurement: Measurement, goals: MeasurementGoals, body: unknown, keepPins = false) {
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
        staffPin: keepPins ? sponsor.staffPin : (parseStaffPin(row.staffPin) ?? sponsor.staffPin),
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
  // 값이 없어도 행사의 가치는 이미 정해진 값과 맞아야 한다.
  const set = measurement.sponsors.filter((sponsor) => sponsor.value !== undefined)
  if (several && set.length === measurement.sponsors.length && set.reduce((sum, item) => sum + item.value!, 0) !== total) {
    throw new HttpError(400, `협찬사별 가치를 더하면 협찬 가치 합계(${total.toLocaleString("ko-KR")}원)와 같아야 해요.`)
  }
}

// 목표 폼이 직원 PIN을 보내면 6자리여야 한다.
export function parseStaffPin(value: unknown) {
  if (value === undefined) return undefined
  const pin = text(value)
  if (!/^\d{6}$/.test(pin)) throw new HttpError(400, "직원 확인 PIN은 숫자 6자리로 적어 주세요.")
  return pin
}

// 다른 행사에 없는 체크인 코드.
function newCode(database: Database) {
  let code: string
  do code = randomBytes(4).toString("hex")
  while (database.measurements.some((measurement) => measurement.code === code))
  return code
}

export const newStaffPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0")

// 네 자리 시절의 PIN을 새 PIN으로 바꾼다. 바뀐 것이 있으면 true다. 값이 무작위라
// 불러올 때마다 하면 API 복사본마다 달라지므로, 한 번 하고 저장한다(store.ts).
// 데모 행사는 문서에 적힌 값으로 바꾸고, 다른 행사는 한 행사의 PIN이 서로
// 겹치지 않게 뽑는다.
export function upgradePins(database: Database) {
  let changed = false
  for (const measurement of database.measurements) {
    const demo = isDemoEvent(database, measurement)
    const used = new Set([measurement.staffPin, measurement.groupPin, ...measurement.sponsors.map((item) => item.staffPin)])
    const fresh = (old: string) => {
      changed = true
      if (demo) return `${old}34`
      let pin: string
      do pin = newStaffPin()
      while (used.has(pin))
      used.add(pin)
      return pin
    }
    const { staffPin } = measurement
    if (staffPin.length !== 6) measurement.staffPin = fresh(staffPin)
    if (measurement.groupPin.length !== 6) measurement.groupPin = fresh(measurement.groupPin)
    for (const sponsor of measurement.sponsors) {
      if (sponsor.staffPin.length === 6) continue
      changed = true
      // 첫 협찬사는 행사의 PIN을 넘겨받았으므로 같은 값을 이어 간다.
      sponsor.staffPin = sponsor.staffPin === staffPin ? measurement.staffPin : fresh(sponsor.staffPin)
    }
  }
  return changed
}

// 행사의 어느 협찬사도 쓰지 않는 PIN. PIN만 봐도 어느 매장인지 알 수 있다.
function newSponsorPin(measurement: Measurement) {
  let pin: string
  do pin = newStaffPin()
  while (measurement.sponsors.some((sponsor) => sponsor.staffPin === pin))
  return pin
}

// 새 PIN으로 바꾼다. 행사 중에 유출이 의심될 때 쓰며, 지금 PIN은 바로 막힌다.
// 값은 서버가 만들고 이 행사의 어떤 PIN과도 겹치지 않는다. 단체는 자기 PIN을,
// 브랜드는 자기 매장 PIN을, 협찬사 몫이 없으면 행사의 직원 PIN을 바꾼다.
export function rotatePin(measurement: Measurement, sponsor: EventSponsor | undefined, side: ChatSide) {
  const used = new Set([measurement.staffPin, measurement.groupPin, ...measurement.sponsors.map((item) => item.staffPin)])
  let pin: string
  do pin = newStaffPin()
  while (used.has(pin))
  if (side === "group") {
    measurement.groupPin = pin
    return
  }
  // 첫 협찬사는 행사의 PIN을 넘겨받는다. 그 값을 남겨 두면 협찬이 취소됐을 때
  // 막은 PIN이 되살아난다.
  if (sponsor && measurement.staffPin !== sponsor.staffPin) sponsor.staffPin = pin
  else {
    if (sponsor) sponsor.staffPin = pin
    measurement.staffPin = pin
  }
}

// 오늘 틀린 PIN 시도 수. PIN을 가진 쪽이 바꿀지 판단하도록 보여 준다.
export const pinMissesToday = (measurement: Measurement) =>
  measurement.pinMisses?.day === todayInKorea() ? measurement.pinMisses.count : 0

// 행사를 협찬하는 브랜드마다 행사 측정에 자기 쿠폰, 직원 PIN, 집계를 준다.
// 행사의 첫 협찬사가 혼자일 때는 행사가 지금까지 가진 쿠폰, PIN, 집계,
// 이미 나간 쿠폰 번호를 넘겨받는다. 이후 협찬사는 브랜드 이름을 딴 쿠폰과
// 0에서 시작하고, 단체가 각자의 몫을 다시 정하기 전까지 행사의 가치는
// 균등 분할로 돌아간다. 추가된 것이 있는지 돌려준다.
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

// 협찬사가 낸 금액. 혼자면 전체 가치, 아니면 단체가 정한 몫이고 아직
// 없으면 균등 분할이다.
export function shareValue(measurement: Measurement, sponsor: EventSponsor) {
  const total = measurement.goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  if (measurement.sponsors.length <= 1) return total
  return sponsor.value ?? Math.round(total / measurement.sponsors.length)
}

// 행사의 측정. 처음에는 기본 목표로 만들고 협찬사마다 몫을 둔다. 바뀐 것이
// 있는지 돌려주어 호출한 쪽이 저장할지 알게 한다.
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

// 지금까지의 방문으로 추정한 협찬사 매장의 매출.
export const estimatedSales = (measurement: Measurement) =>
  measurement.metrics.visits * measurement.goals.averageSpend

// 행사의 리포트. 목표와 함께, 실시간 집계로 계산한 도달과 ROAS를 담는다
// (도달: QR 스캔 + 목표에 적은 행사장 밖 도달 + 브랜드가 확인한 게시물 `posted`, ROAS: 추정 매출 ÷ 협찬 가치). 확인
// 방식(양쪽이 확인한 그대로)과 행사장에서 확인한 내용도 담는다. PIN은
// 행사 주인에게만 보내고 단체의 행사장 PIN은 주인이 단체일 때만 보낸다.
export function buildReport(
  measurement: Measurement,
  event: EventItem,
  { withPin = false, withGroupPin = false, pinsDay = "", canRotatePin = false, posted = { confirmed: 0, pending: 0 } } = {},
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
    reach: metrics.scans + goals.snsReach + posted.confirmed,
    roas: percent(estimatedSales(measurement), sponsorValue),
    targets: goals.targets,
    hourlyScans: measurement.hourlyScans,
    valueBreakdown: goals.valueBreakdown,
    averageSpend: goals.averageSpend,
    snsReach: goals.snsReach,
    postedReach: posted.confirmed,
    pendingReach: posted.pending,
    coupon: goals.coupon,
    ...(withPin ? { staffPin: measurement.staffPin, pinMisses: pinMissesToday(measurement) } : {}),
    ...(withGroupPin ? { groupPin: measurement.groupPin } : {}),
    ...(pinsDay ? { pinsFrom: pinsDay } : {}),
    ...(canRotatePin ? { canRotatePin } : {}),
    methods: activeMethodsOf(measurement),
    venue: venueCountsOf(metrics),
    // 학생 단체 자신의 리포트용 참석자 정보. 행사 종류, 예상 참석자, 그리고
    // 설문에 응답이 있으면 그 집계.
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

// 행사가 체크인을 받는 기간(한국 날짜 기준). 스캔과 쿠폰은 행사 당일과
// 다음 날(자정을 넘기는 행사 때문), 매장 방문은 마지막 쿠폰 발급 7일 뒤
// 쿠폰이 소진될 때까지다. 데모 계정의 행사는 늘 열려 있어 방문자가
// 흐름을 체험할 수 있다.
export const couponDays = 7

export function checkInWindow(event: EventItem) {
  const end = addDays(event.endDate ?? event.date, 1)
  return { start: event.date, end, visitsEnd: addDays(end, couponDays) }
}

export const isDemoEvent = (database: Database, measurement: Measurement) =>
  Object.values(database.demoAccountIds).includes(measurement.accountId)

// 행사를 운영하는 쪽에게 PIN이 보이기 시작하는 날은 행사 하루 전이다.
// 데모 계정은 방문자가 체험하도록 바로 보인다.
export const pinsFrom = (event: EventItem) => addDays(event.date, -1)

export const pinsOpen = (database: Database, measurement: Measurement, event: EventItem) =>
  isDemoEvent(database, measurement) || pinsFrom(event) <= todayInKorea()

// 행사가 세는 스캔의 상한. 돌려 쓰는 QR로 도달이 예상보다 크게 부풀지
// 않도록 예상 인원의 세 배, 최소 100으로 한다. 데모 계정의 방문자가
// 무엇을 시도해도 같다.
export const scanCeiling = (database: Database, measurement: Measurement) =>
  isDemoEvent(database, measurement) ? Infinity : Math.max(100, measurement.goals.expectedAudience * 3)

// 행사 기간 밖의 스캔이나 쿠폰, 쿠폰이 소진된 뒤의 방문을 거절한다.
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

// 측정이 남기는 참여 기록의 최대 개수. 캠퍼스 행사에는 한참 넉넉하고
// 데이터 파일이 커지지 않을 만큼 낮다.
export const passLimit = 20_000

// 행사에 더는 필요 없는 참여 기록을 지운다. 기간이 끝나면 쿠폰이 없는
// 기록을, 쿠폰이 소진되면 전부 지운다. 지운 것이 있는지 돌려준다.
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

// 행사장 직원이 확인하는 것. 기록에 적힌 이름 그대로 쓴다.
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

// 사람 단위가 아닌 상자 단위로 센다.
const countedByBox: MetricKind[] = ["samples", "giveaways"]

// QR 스캔, 쿠폰, 매장 방문 한 건 또는 행사장에서 확인한 것(`amount`개의
// 샘플, 도장이나 게시물 하나, 실수를 바로잡는 더 적은 양)과 그 기록을
// 센다. 협찬사의 집계는 행사의 집계와 함께 늘어난다.
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
    // 행사가 열리는 한국 시간 기준으로 날짜별 시각을 센다.
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

// 측정이 속한 행사와 그 주인의 계정 id.
export function eventOf(database: Database, measurement: Measurement) {
  return database.events[measurement.accountId]?.find((event) => event.id === measurement.eventId)
}
