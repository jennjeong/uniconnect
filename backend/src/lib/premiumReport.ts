import { createHash } from "node:crypto"

import { paidFor } from "./billing.js"
import { browse } from "./catalog.js"
import { addDays, todayInKorea } from "./dates.js"
import { checkInWindow, eventOf, shareValue } from "./measurements.js"
import { activeMethodsOf, venueCountsOf } from "./methods.js"
import { isDemoAccount } from "./reviews.js"
import { finishedSponsorships } from "./sponsorships.js"
import type { Account, Database, EventItem, Measurement, Sponsorship } from "../types.js"

// 상세 성과 리포트: what a brand buys for one sponsorship (the business plan's
// 50,000 KRW report), worked out live from the event's measurement and
// beyond what the free screens show: a grade against the goals, each goal
// scored, the funnel and costs against the other events measured here, when
// people came, the effect over the store's usual days (from the brand's own
// counts), what each side did by the e-contract, both reviews, and what to
// do next. The words are the page's; this answers figures and codes.

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0)
const won = (value: number) => Math.round(value)

// A figure among the other events measured here: the median, how many there
// were, and the share of them this one beat (higher is better unless
// `lowerIsBetter`). None below three events, as a median of fewer says little.
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

// The figures of one measured event, for comparing: its own rates, with
// the whole event's value.
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

// The events to compare with: those over, with scans, but this one. Members
// compare with members' events; the demo with everything, examples too.
function comparable(database: Database, measurement: Measurement, demo: boolean) {
  const today = todayInKorea()
  const demoIds = new Set(Object.values(database.demoAccountIds))
  return database.measurements.filter((other) => {
    if (other === measurement || other.metrics.scans === 0) return false
    if (!demo && demoIds.has(other.accountId)) return false
    const event = eventOf(database, other)
    return Boolean(event && (event.endDate ?? event.date) < today)
  })
}

// Days between two Korean dates.
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000)

const koreanDate = (at: string) => new Date(new Date(at).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

// When people came: the scans by hour, each day's scans, coupons and visits
// by the day of the window, and how many days after taking a coupon each
// visit came (from the records kept, the latest 300).
function timing(measurement: Measurement, event: EventItem) {
  const window = checkInWindow(event)
  const days: { date: string; scans: number; coupons: number; visits: number }[] = []
  for (let date = window.start; date <= window.visitsEnd; date = addDays(date, 1)) days.push({ date, scans: 0, coupons: 0, visits: 0 })
  const couponDay = new Map<string, string>()
  const lags = new Map<number, number>()
  for (const entry of [...measurement.log].sort((a, b) => a.at.localeCompare(b.at))) {
    if (entry.kind !== "scans" && entry.kind !== "coupons" && entry.kind !== "visits") continue
    const date = koreanDate(entry.at)
    const day = days.find((item) => item.date === date)
    if (day) day[entry.kind] += 1
    if (entry.kind === "coupons") couponDay.set(entry.participant, date)
    if (entry.kind === "visits") {
      const took = couponDay.get(entry.participant)
      if (took) lags.set(Math.max(0, daysBetween(took, date)), (lags.get(Math.max(0, daysBetween(took, date))) ?? 0) + 1)
    }
  }
  const peak = [...measurement.hourlyScans].sort((a, b) => b.scans - a.scans)[0]
  const lagCount = [...lags.values()].reduce((sum, count) => sum + count, 0)
  const lagTotal = [...lags.entries()].reduce((sum, [lag, count]) => sum + lag * count, 0)
  return {
    hourly: measurement.hourlyScans,
    peak: peak ? { date: peak.date, hour: peak.hour, scans: peak.scans } : null,
    daily: days.filter((day) => day.date <= todayInKorea()),
    lag: {
      // Visits by days after the coupon: 0 (the same day) to 7.
      days: Array.from({ length: 8 }, (_, lag) => lags.get(lag) ?? 0),
      average: lagCount ? Math.round((lagTotal / lagCount) * 10) / 10 : null,
      sample: lagCount,
    },
    recordsKept: measurement.log.length,
  }
}

// The demo brand's sample report, open to visitors (not logged in) so they
// see a whole one. Logged in as the demo brand it is locked like anyone's,
// to show buying it (with Toss test keys).
export const sampleReportId = "sp-busking"

// Whether an account may read a sponsorship's report: bought it (Pro,
// lib/pro.ts, adds itself).
export const reportAccess: ((database: Database, account: Account, sponsorshipId: string) => boolean)[] = [
  (database, account, id) => Boolean(paidFor(database, account.id, "report", id)),
]

export const canReadReport = (database: Database, account: Account, id: string, visitor: boolean) =>
  (visitor && isDemoAccount(database, account) && id === sampleReportId) ||
  reportAccess.some((allows) => allows(database, account, id))

// The report's number: the event day and a short hash of the sponsorship.
export const reportNumber = (sponsorship: Sponsorship) =>
  `UC-${sponsorship.date.replace(/-/g, "")}-${createHash("sha256").update(sponsorship.id).digest("hex").slice(0, 6).toUpperCase()}`

// The brand's sponsorship behind a report, with its measured event.
export function sponsorshipFor(database: Database, account: Account, id: string) {
  const sponsorship = (database.sponsorships[account.id] ?? []).find((item) => item.id === id)
  if (!sponsorship?.eventId) return undefined
  const measurement = database.measurements.find((item) => item.eventId === sponsorship.eventId)
  const event = measurement && eventOf(database, measurement)
  if (!measurement || !event) return undefined
  return { sponsorship, measurement, event }
}

// Ready to buy once the event's day has come.
export const reportOpen = (event: EventItem) => event.date <= todayInKorea()

// Where a sponsorship's report stands for the account: readable, to buy,
// not yet (before the event's day), or none (no measured event).
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
  const reach = metrics.scans + goals.snsReach
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

  // The effect over the usual days, from the brand's own store counts: the
  // daily visitors on the same weekdays before, and during the coupons' days.
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
          // How many of the extra visitors the coupons account for.
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

  // What to do next, as codes the page words: from the weakest step of the
  // funnel, the timing, the costs and the goals.
  const advice: { code: string; values?: Record<string, number | string> }[] = []
  if (time.peak) advice.push({ code: "peak-hour", values: { hour: time.peak.hour } })
  if (mine.scanRate < goals.targets.qrRate) advice.push({ code: "raise-scans", values: { rate: mine.scanRate, target: goals.targets.qrRate } })
  if (metrics.scans > 0 && mine.couponRate < 60) advice.push({ code: "coupon-appeal", values: { rate: mine.couponRate } })
  if (coupons > 0 && mine.visitRate < 30) advice.push({ code: "visit-nudge", values: { rate: mine.visitRate } })
  if (time.lag.average !== null && time.lag.average >= 3) advice.push({ code: "shorter-window", values: { days: time.lag.average } })
  if (actual.roas >= goals.targets.roas && goals.targets.roas > 0) advice.push({ code: "renew", values: { roas: actual.roas } })
  else if (spend > 0 && goals.averageSpend > 0) {
    // The value at which this many visits would have met the ROAS goal.
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

  // The event and what was agreed: who, where, the value by kind, the
  // coupon, the confirmation methods and the goals.
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

  // Who came, from the optional survey: counts, and how many of those who
  // scanned answered.
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

  // The store visits: how many coupons became visits, on which weekday, how
  // soon, and how many were likely new customers (by the survey's share).
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

  // Return on the value: the visits that would have paid it back, and the
  // ROAS if each visitor spent 20% less or more than the group's estimate.
  const roi = {
    breakEvenVisits: goals.averageSpend > 0 ? Math.ceil(spend / goals.averageSpend) : null,
    sensitivity: [0.8, 1, 1.2].map((factor) => ({
      factor,
      spendPerVisit: Math.round(goals.averageSpend * factor),
      roas: percent(visits * goals.averageSpend * factor, spend),
    })),
  }

  // The group's record here: its other measured events and its reviews.
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

  // This sponsorship among the brand's own others.
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
    snsReach: goals.snsReach,
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
