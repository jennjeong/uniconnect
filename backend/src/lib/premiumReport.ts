import { createHash } from "node:crypto"

import { paidFor } from "./billing.js"
import { browse } from "./catalog.js"
import { addDays, todayInKorea } from "./dates.js"
import { checkInWindow, dailyCounts, defaultGoals, emptyMetrics, eventOf, shareValue } from "./measurements.js"
import { activeMethodsOf, venueCountsOf } from "./methods.js"
import { isDemoAccount } from "./reviews.js"
import { postedReach } from "./snsPosts.js"
import { finishedSponsorships } from "./sponsorships.js"
import type { Account, Database, EventItem, Measurement, Sponsorship, VenueCounts } from "../types.js"

// 상세 성과 리포트: 브랜드가 협찬 하나에 대해 사는 것(사업 계획의
// 50,000원 리포트)이다. 행사 측정에서 실시간으로 계산하며 무료 화면보다
// 더 많이 담는다. 목표 대비 등급, 목표별 점수, 이곳에서 측정한 다른 행사와
// 견준 퍼널과 비용, 사람이 온 시간대, 매장의 평소 요일과 견준 효과(브랜드
// 자신의 집계 기준), 전자계약서에 따라 각 측이 한 일, 양쪽 후기, 다음에
// 할 일을 담는다. 문구는 페이지가 정하고 여기서는 수치와 코드를 답한다.

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)
const won = (value: number) => Math.round(value)

// 이곳에서 측정한 다른 행사들 사이의 수치. 중앙값, 비교한 행사 수, 이 행사가
// 앞선 비율이다(`lowerIsBetter`가 아니면 높을수록 좋다). 행사가 셋 미만이면
// 중앙값이 말해 주는 게 적어 없음으로 둔다.
export type Benchmark = { median: number; count: number; beats: number } | null

function benchmark(value: number, others: number[], lowerIsBetter = false): Benchmark {
  const sample = others.filter((item) => Number.isFinite(item))
  if (sample.length < 3) return null
  const sorted = [...sample].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  const beaten = sample.filter((item) => (lowerIsBetter ? value < item : value > item)).length
  return { median: Math.round(median * 10) / 10, count: sample.length, beats: Math.round((beaten / sample.length) * 100) }
}

// 측정된 행사 하나의 비교용 수치. 자체 비율과 행사 전체의 가치를 담는다.
function eventFigures(measurement: Measurement) {
  const { metrics, goals } = measurement
  const value = goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  return {
    scanRate: percent(metrics.scans, goals.expectedAudience),
    couponRate: percent(metrics.coupons, metrics.scans),
    visitRate: percent(metrics.visits, metrics.coupons),
    roas: percent(metrics.visits * goals.averageSpend, value),
    costPerVisit: metrics.visits > 0 && value > 0 ? value / metrics.visits : Number.NaN,
  }
}

// 비교할 행사. 끝났고 스캔이 있는 행사 중 이 행사를 뺀 것이다. 회원은
// 회원의 행사와, 데모는 예시까지 모든 행사와 비교한다.
function comparable(database: Database, measurement: Measurement, demo: boolean) {
  const today = todayInKorea()
  const demoIds = new Set(Object.values(database.demoAccountIds))
  return database.measurements.filter((other) => {
    if (other === measurement || other.metrics.scans === 0 || other.alwaysOn) return false
    if (!demo && demoIds.has(other.accountId)) return false
    const event = eventOf(database, other)
    return Boolean(event && (event.endDate ?? event.date) < today)
  })
}

// 두 한국 날짜 사이의 일수.
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000)

const koreanDate = (at: string) => new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

// 사람이 온 시간. 시간대별 스캔, 기간 중 날짜별 스캔, 쿠폰, 방문, 그리고
// 쿠폰을 받은 지 며칠 뒤에 방문했는지(이것만 남아 있는 최근 300건 기준).
export function timing(measurement: Measurement, event: EventItem) {
  const window = checkInWindow(event)
  const days: { date: string; scans: number; coupons: number; visits: number }[] = []
  for (let date = window.start; date <= window.visitsEnd; date = addDays(date, 1)) days.push({ date, scans: 0, coupons: 0, visits: 0 })
  const couponDay = new Map<string, string>()
  const lags = new Map<number, number>()
  for (const entry of [...measurement.log].sort((a, b) => a.at.localeCompare(b.at))) {
    if (entry.kind !== "scans" && entry.kind !== "coupons" && entry.kind !== "visits") continue
    const date = koreanDate(entry.at)
    if (entry.kind === "coupons") couponDay.set(entry.participant, date)
    if (entry.kind === "visits") {
      const took = couponDay.get(entry.participant)
      if (took) lags.set(Math.max(0, daysBetween(took, date)), (lags.get(Math.max(0, daysBetween(took, date))) ?? 0) + 1)
    }
  }
  const counted = dailyCounts(measurement)
  for (const day of days) Object.assign(day, counted[day.date])
  const peak = [...measurement.hourlyScans].sort((a, b) => b.scans - a.scans)[0]
  const lagCount = [...lags.values()].reduce((sum, count) => sum + count, 0)
  const lagTotal = [...lags.entries()].reduce((sum, [lag, count]) => sum + lag * count, 0)
  return {
    hourly: measurement.hourlyScans,
    peak: peak ? { date: peak.date, hour: peak.hour, scans: peak.scans } : null,
    daily: days.filter((day) => day.date <= todayInKorea()),
    lag: {
      // 쿠폰 받은 뒤 며칠 만에 방문했는지: 0(당일)부터 7까지.
      days: Array.from({ length: 8 }, (_, lag) => lags.get(lag) ?? 0),
      average: lagCount ? Math.round((lagTotal / lagCount) * 10) / 10 : null,
      sample: lagCount,
    },
    recordsKept: measurement.log.length,
  }
}

// 데모 브랜드의 샘플 리포트. 로그인하지 않은 방문자에게 열어 전체를 볼 수
// 있게 한다. 데모 브랜드로 로그인하면 다른 계정처럼 잠겨 있어 구매 과정을
// 보여 준다(Toss 테스트 키 사용).
export const sampleReportId = "sp-busking"

// 계정이 협찬의 리포트를 읽을 수 있는지. 구매했으면 가능하다(Pro는
// lib/pro.ts가 스스로 더한다).
export const reportAccess: ((database: Database, account: Account, sponsorshipId: string) => boolean)[] = [
  (database, account, id) => Boolean(paidFor(database, account.id, "report", id)),
]

export const canReadReport = (database: Database, account: Account, id: string, visitor: boolean) =>
  (visitor && isDemoAccount(database, account) && id === sampleReportId) ||
  reportAccess.some((allows) => allows(database, account, id))

// 리포트 번호: 행사 날짜와 협찬의 짧은 해시.
export const reportNumber = (sponsorship: Sponsorship) =>
  `UC-${sponsorship.date.replace(/-/g, "")}-${createHash("sha256").update(sponsorship.id).digest("hex").slice(0, 6).toUpperCase()}`

// 리포트가 가리키는 브랜드의 협찬과 그 측정된 행사.
export function sponsorshipFor(database: Database, account: Account, id: string) {
  const sponsorship = (database.sponsorships[account.id] ?? []).find((item) => item.id === id)
  if (!sponsorship) return undefined
  const measurement = sponsorship.eventId ? database.measurements.find((item) => item.eventId === sponsorship.eventId) : undefined
  const event = measurement && eventOf(database, measurement)
  if (!measurement || !event) return fromRecord(sponsorship)
  return { sponsorship, measurement, event }
}

// 측정된 행사가 없는 협찬(브랜드의 캠페인이거나 현장 집계 이전의 것)도
// 자체 기록으로 리포트를 만든다. 쓴 비용, 쿠폰과 방문, 그로 인한 매출
// (그래서 방문자당 비용), ROAS 목표를 담는다. 측정만 가진 것(QR 스캔,
// 시간대, 설문)은 비워 둔다.
function fromRecord(sponsorship: Sponsorship) {
  const event: EventItem = {
    id: `record-${sponsorship.id}`,
    name: sponsorship.eventName,
    date: sponsorship.date,
    people: "",
    types: [],
    status: "측정 완료",
    createdAt: sponsorship.date,
  }
  const base = defaultGoals(event)
  const measurement: Measurement = {
    eventId: event.id,
    accountId: "",
    code: "",
    metrics: { ...emptyMetrics(), ...venueCountsOf(sponsorship as Partial<VenueCounts> as VenueCounts), coupons: sponsorship.coupons, visits: sponsorship.visits },
    hourlyScans: [],
    log: [],
    goals: {
      ...base,
      averageSpend: sponsorship.visits > 0 ? Math.round(sponsorship.sales / sponsorship.visits) : base.averageSpend,
      valueBreakdown: [{ type: "협찬액", value: sponsorship.spend }],
      targets: { ...base.targets, roas: sponsorship.targetRoas },
    },
    staffPin: "",
    groupPin: "",
    sponsors: [],
    passes: {},
  }
  return { sponsorship, measurement, event }
}

// 행사 날이 되면 살 수 있다.
export const reportOpen = (event: EventItem) => event.date <= todayInKorea()

// 계정 기준으로 협찬 리포트의 상태. 읽을 수 있음, 살 수 있음, 아직 아님
// (행사 날 전), 없음(측정된 행사 없음) 중 하나다.
export function reportState(database: Database, account: Account, sponsorshipId: string, visitor: boolean) {
  const found = sponsorshipFor(database, account, sponsorshipId)
  if (!found) return "none" as const
  if (canReadReport(database, account, sponsorshipId, visitor)) return "open" as const
  return reportOpen(found.event) ? ("locked" as const) : ("soon" as const)
}

export function premiumReport(database: Database, account: Account, id: string) {
  const found = sponsorshipFor(database, account, id)
  if (!found) return undefined
  const { sponsorship, measurement, event } = found
  const demo = isDemoAccount(database, account)
  const sponsor = measurement.sponsors.find((item) => item.id === sponsorship.id)
  const { goals, metrics } = measurement
  const spend = sponsor ? shareValue(measurement, sponsor) : goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  const coupons = sponsor?.metrics.coupons ?? metrics.coupons
  const visits = sponsor?.metrics.visits ?? metrics.visits
  const sales = visits * goals.averageSpend
  const snsReach = goals.snsReach + postedReach(database, measurement).confirmed
  const reach = metrics.scans + snsReach
  const actual = {
    reach,
    scans: metrics.scans,
    coupons,
    visits,
    qrRate: percent(metrics.scans, goals.expectedAudience),
    visitRate: percent(visits, metrics.scans),
    roas: percent(sales, spend),
  }
  const scorecard = (Object.keys(actual) as (keyof typeof actual)[]).map((key) => ({
    key,
    target: goals.targets[key],
    actual: actual[key],
    achievement: goals.targets[key] > 0 ? Math.round((actual[key] / goals.targets[key]) * 100) : null,
  }))
  const scored = scorecard.flatMap((item) => (item.achievement === null ? [] : [Math.min(item.achievement, 150)]))
  const average = scored.length ? Math.round(scored.reduce((sum, item) => sum + item, 0) / scored.length) : 0
  const grade = average >= 120 ? "S" : average >= 100 ? "A" : average >= 80 ? "B" : average >= 60 ? "C" : "D"

  const others = comparable(database, measurement, demo).map(eventFigures)
  const mine = {
    scanRate: actual.qrRate,
    couponRate: percent(coupons, metrics.scans),
    visitRate: percent(visits, coupons),
    roas: actual.roas,
    costPerVisit: visits > 0 && spend > 0 ? spend / visits : Number.NaN,
  }
  const funnel = [
    { key: "audience", count: goals.expectedAudience, rate: null, benchmark: null },
    { key: "scans", count: metrics.scans, rate: mine.scanRate, benchmark: benchmark(mine.scanRate, others.map((item) => item.scanRate)) },
    { key: "coupons", count: coupons, rate: mine.couponRate, benchmark: benchmark(mine.couponRate, others.map((item) => item.couponRate)) },
    { key: "visits", count: visits, rate: mine.visitRate, benchmark: benchmark(mine.visitRate, others.map((item) => item.visitRate)) },
  ]
  const per = (count: number) => (count > 0 && spend > 0 ? won(spend / count) : null)
  const costs = {
    perThousandReach: reach > 0 && spend > 0 ? won((spend / reach) * 1000) : null,
    perScan: per(metrics.scans),
    perCoupon: per(coupons),
    perVisit: per(visits),
    perVisitBenchmark: Number.isFinite(mine.costPerVisit)
      ? benchmark(mine.costPerVisit, others.map((item) => item.costPerVisit), true)
      : null,
    roasBenchmark: benchmark(mine.roas, others.map((item) => item.roas)),
  }

  // 브랜드 자신의 매장 집계로 본 효과: 쿠폰 기간 동안과 그 전 같은 요일의
  // 일일 방문자.
  const lift = sponsorship.lift
  const window = checkInWindow(event)
  const liftDays = daysBetween(window.start, window.visitsEnd) + 1
  const effect = lift
    ? (() => {
        const extraPerDay = lift.during - lift.before
        const extraVisitors = Math.round(extraPerDay * liftDays)
        const extraSales = extraVisitors * goals.averageSpend
        return {
          before: lift.before,
          during: lift.during,
          days: liftDays,
          lift: percent(extraPerDay, lift.before),
          extraVisitors,
          extraSales,
          incrementalRoas: percent(extraSales, spend),
          // 늘어난 방문자 중 쿠폰이 차지하는 몫.
          attributedShare: extraVisitors > 0 ? Math.min(100, percent(visits, extraVisitors)) : null,
        }
      })()
    : null

  const proposalId = sponsorship.id.replace(/^sp-/, "")
  const agreement = database.agreements.find((item) => item.id === proposalId)
  const items = (agreement?.items ?? []).map((item) => ({
    side: item.side,
    label: item.label,
    done: Boolean(item.doneAt),
    proof: item.links.length + item.photos.length,
  }))
  const reviews = database.reviews
    .filter((review) => review.proposalId === proposalId && !review.hiddenAt)
    .map(({ side, rating, tags, comment }) => ({ side, rating, tags, comment }))

  const time = timing(measurement, event)
  const venue = venueCountsOf(sponsor?.metrics ?? metrics)
  const methods = activeMethodsOf(measurement, sponsor).map((method) => method.kind)

  // 다음에 할 일을 페이지가 문구로 옮길 코드로 정한다. 퍼널의 가장 약한
  // 단계, 시점, 비용, 목표에서 뽑는다.
  const advice: { code: string; values?: Record<string, number | string> }[] = []
  if (time.peak) advice.push({ code: "peak-hour", values: { hour: time.peak.hour } })
  if (mine.scanRate < goals.targets.qrRate) advice.push({ code: "raise-scans", values: { rate: mine.scanRate, target: goals.targets.qrRate } })
  if (metrics.scans > 0 && mine.couponRate < 60) advice.push({ code: "coupon-appeal", values: { rate: mine.couponRate } })
  if (coupons > 0 && mine.visitRate < 30) advice.push({ code: "visit-nudge", values: { rate: mine.visitRate } })
  if (time.lag.average !== null && time.lag.average >= 3) advice.push({ code: "shorter-window", values: { days: time.lag.average } })
  if (actual.roas >= goals.targets.roas && goals.targets.roas > 0) advice.push({ code: "renew", values: { roas: actual.roas } })
  else if (spend > 0 && goals.averageSpend > 0) {
    // 이만큼의 방문이 ROAS 목표를 채웠을 가치.
    advice.push({ code: "budget", values: { value: won((sales * 100) / Math.max(1, goals.targets.roas)) } })
  }
  if (!effect) advice.push({ code: "add-baseline" })

  const viewer = isDemoAccount(database, account) ? undefined : account
  const groupListing0 = database.groups.find((group) => group.name === sponsorship.groupName)
  const next = browse(database, "groups", viewer)
    .filter((group) => group.id !== groupListing0?.id)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((group) => ({
      id: group.id,
      name: group.name,
      school: group.school ?? "",
      category: group.category,
      score: group.score,
      ...(group.eventName && group.eventDate ? { event: { name: group.eventName, date: group.eventDate } } : {}),
    }))

  // 행사와 합의한 내용: 누가, 어디서, 종류별 가치, 쿠폰, 확인 방식, 목표.
  const groupAccount = database.accounts.find((item) => item.id === measurement.accountId)
  const groupListing =
    (groupAccount?.groupId && database.groups.find((item) => item.id === groupAccount.groupId)) || groupListing0
  const overview = {
    school: groupAccount?.school || groupListing?.school || "",
    category: groupListing?.category ?? "",
    expectedAudience: goals.expectedAudience,
    valueBreakdown: sponsor ? [{ type: "협찬액", value: spend }] : goals.valueBreakdown,
    coupon: sponsor?.coupon ?? goals.coupon,
    targets: goals.targets,
    agreedValue: agreement?.value ?? null,
  }

  // 선택 설문으로 본 참석자: 집계와, 스캔한 사람 중 응답한 수.
  const survey = measurement.survey
  const audience = survey && survey.responses > 0
    ? {
        responses: survey.responses,
        responseRate: percent(survey.responses, metrics.scans),
        grade: survey.grade,
        field: survey.field,
        visited: survey.visited,
        firstTimeShare: percent(survey.visited["처음이에요"] ?? 0, survey.responses),
      }
    : null

  // 매장 방문: 쿠폰이 방문으로 이어진 수, 요일, 걸린 시간, 설문 비율로
  // 본 새 고객일 가능성이 높은 수.
  const weekdays = Array.from({ length: 7 }, () => 0)
  for (const entry of measurement.log) {
    if (entry.kind !== "visits") continue
    weekdays[new Date(`${koreanDate(entry.at)}T00:00:00Z`).getUTCDay()] += 1
  }
  const visitsAnalysis = {
    redemption: percent(visits, coupons),
    sameDayShare: time.lag.sample > 0 ? percent(time.lag.days[0], time.lag.sample) : null,
    weekdays,
    newCustomers: audience ? Math.round((visits * audience.firstTimeShare) / 100) : null,
  }

  // 가치 대비 수익: 가치를 되찾았을 방문 수, 그리고 방문자가 단체의
  // 추정보다 20% 덜 또는 더 썼을 때의 ROAS.
  const roi = {
    breakEvenVisits: goals.averageSpend > 0 ? Math.ceil(spend / goals.averageSpend) : null,
    sensitivity: [0.8, 1, 1.2].map((factor) => ({
      factor,
      spendPerVisit: Math.round(goals.averageSpend * factor),
      roas: percent(visits * goals.averageSpend * factor, spend),
    })),
  }

  // 이곳에서 단체의 기록: 측정한 다른 행사와 후기.
  const groupEvents = database.measurements.filter((item) => item.accountId === measurement.accountId && item !== measurement && item.metrics.scans > 0)
  const ratings = groupListing ? database.reviews.filter((review) => review.aboutId === groupListing.id && !review.hiddenAt) : []
  const partner = {
    otherEvents: groupEvents.length,
    averageScanRate: groupEvents.length
      ? Math.round(groupEvents.reduce((sum, item) => sum + percent(item.metrics.scans, item.goals.expectedAudience), 0) / groupEvents.length)
      : null,
    rating: ratings.length ? Math.round((ratings.reduce((sum, review) => sum + review.rating, 0) / ratings.length) * 10) / 10 : null,
    reviewCount: ratings.length,
  }

  // 브랜드 자신의 다른 협찬 가운데서 이 협찬의 위치.
  const own = finishedSponsorships(database, account.id).filter((item) => item.spend > 0)
  const ownRoas = own.map((item) => ({ id: item.id, roas: percent(item.sales, item.spend), perVisit: item.visits ? item.spend / item.visits : null }))
  const history = {
    count: own.length,
    averageRoas: own.length ? Math.round(ownRoas.reduce((sum, item) => sum + item.roas, 0) / own.length) : null,
    averagePerVisit: (() => {
      const known = ownRoas.flatMap((item) => (item.perVisit === null ? [] : [item.perVisit]))
      return known.length ? Math.round(known.reduce((sum, item) => sum + item, 0) / known.length) : null
    })(),
    rank: own.length ? [...ownRoas].sort((a, b) => b.roas - a.roas).findIndex((item) => item.id === sponsorship.id) + 1 : null,
  }

  const final = todayInKorea() > window.visitsEnd
  return {
    number: reportNumber(sponsorship),
    issuedAt: new Date().toISOString(),
    final,
    finalOn: addDays(window.visitsEnd, 1),
    sponsorship: { id: sponsorship.id, brandName: account.name, groupName: sponsorship.groupName, eventName: event.name },
    event: { date: event.date, endDate: event.endDate, venue: event.venue, people: event.people, window },
    spend,
    averageSpend: goals.averageSpend,
    snsReach,
    sales,
    grade,
    achievement: average,
    scorecard,
    funnel,
    costs,
    time,
    effect,
    fulfillment: { items, done: items.filter((item) => item.done).length, proof: items.reduce((sum, item) => sum + item.proof, 0) },
    venue,
    methods,
    reviews,
    advice,
    next,
    benchmarkCount: others.length,
    overview,
    audience,
    visitsAnalysis,
    roi,
    partner,
    history,
    groupName: groupListing?.name ?? sponsorship.groupName,
  }
}

export type PremiumReport = NonNullable<ReturnType<typeof premiumReport>>
