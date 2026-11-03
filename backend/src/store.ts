import {
  createSeed,
  demoContacts,
  museConcertPage,
  seedBrands,
  seedConversations,
  seedReviews,
  seedSurvey,
  seedGroups,
  seedMeasurements,
  seedOffers,
  seedPosts,
  freshenDemoReport,
  freshenExamplePosts,
  seedRequests,
  seedSponsorships,
} from "./data/seed.js"
import { acceptedProposal, agreementShare } from "./lib/agreements.js"
import { toIsoDate } from "./lib/dates.js"
import { HttpError } from "./lib/errors.js"
import { emptyMetrics, newStaffPin, prunePasses, syncSponsors } from "./lib/measurements.js"
import { upgradeMethods } from "./lib/methods.js"
import { currentStorage, StaleWrite } from "./lib/storage.js"
import { renamedAccountTypes } from "./lib/validation.js"
import { hashToken } from "./middleware/session.js"
import type { Database, Metrics, MetricEntry, Report } from "./types.js"

export { backupFolder, backups } from "./lib/storage.js"

// The data lives in memory as one document. Routes only touch it through
// getDatabase/saveDatabase, which writes it where it is kept
// (lib/storage.ts): a JSON file on one machine, Postgres on Vercel.
let database: Database | undefined
let pendingWrite = Promise.resolve()
// The data as last written, to go back to when a write fails, and a count
// that moves on each time one does or the data is read anew.
let durable = ""
let generation = 0
// The stored version this copy last read or wrote, and when it last looked
// for other copies' writes.
let version = 0
let checkedAt = 0

// How often a copy of the API on shared storage looks for others' writes.
export const freshness = { everyMs: 2000 }

export async function loadDatabase() {
  if (await reload()) return getDatabase()
  const seed = await createSeed()
  for (const measurement of seed.measurements) syncSponsors(seed, measurement)
  freshenDemoReport(seed)
  replace(seed)
  durable = JSON.stringify(seed)
  version = 0
  try {
    await saveDatabase()
  } catch (error) {
    // Another copy of the API seeded the database first: its data stands.
    if (!(await reload())) throw error
  }
  return getDatabase()
}

// Puts data in place of what is in memory, in the same object, so code
// holding the database sees it.
function replace(next: Database) {
  if (!database) {
    database = next
    return
  }
  const current = database as unknown as Record<string, unknown>
  for (const key of Object.keys(current)) delete current[key]
  Object.assign(current, next)
}

// Reads the stored data again (upgraded like a fresh start); false when
// nothing is stored yet. Writes queued from before it are turned away, as
// their changes were made to the data it replaces.
async function reload() {
  const stored = await currentStorage().read()
  if (!stored) return false
  replace(upgradeDatabase(JSON.parse(stored.data) as Database))
  durable = JSON.stringify(getDatabase())
  version = stored.version
  generation += 1
  return true
}

// Another copy of the API (Vercel starts more than one when busy) may have
// saved since this one last read or wrote. With shared storage each request
// first looks at the stored version, at most every freshness.everyMs, and
// reads the data again when it has moved on, once this copy's own queued
// writes are in. A database out of reach leaves the data as it is.
export async function refreshDatabase() {
  const storage = currentStorage()
  if (!storage.shared || !database || Date.now() - checkedAt < freshness.everyMs) return
  checkedAt = Date.now()
  try {
    await pendingWrite
    const latest = await storage.version()
    if (latest !== undefined && latest !== version) await reload()
  } catch (error) {
    console.error(`[store] ${(error as Error).message}`)
  }
}

const notSaved = "저장하지 못해서 방금 한 작업을 되돌렸어요. 잠시 후 다시 시도해 주세요."

// Fills in data added after a db.json was created, so existing accounts,
// sessions and events survive an update.
export function upgradeDatabase(stored: Database) {
  // Before version 2 nobody could edit the catalogs and they were refreshed
  // from the seed on every start, so older files take the current seed once
  // (with SNS and portfolios). From then on, edits made in 내 정보 stay.
  if ((stored.catalogVersion ?? 1) < 2) {
    stored.brands = structuredClone(seedBrands)
    stored.groups = structuredClone(seedGroups)
    stored.catalogVersion = 2
  }
  // Version 3 gave the seeded brands a demo store location, for distances to
  // campuses, once: a brand that clears its address keeps it cleared.
  if ((stored.catalogVersion ?? 1) < 3) {
    for (const brand of stored.brands) {
      const seeded = seedBrands.find((item) => item.id === brand.id)
      if (seeded?.location && !brand.location) brand.location = { ...seeded.location }
    }
    stored.catalogVersion = 3
  }
  // Version 4 drops the coordinates Kakao's address search gave, which may not
  // be kept: the address stays and is placed again through OpenStreetMap when
  // it is next saved. The demo stores keep theirs, which never came from Kakao.
  if ((stored.catalogVersion ?? 1) < 4) {
    for (const brand of stored.brands) {
      const seeded = seedBrands.find((item) => item.id === brand.id)?.location
      const location = brand.location
      if (location?.lat === undefined) continue
      if (seeded && seeded.lat === location.lat && seeded.lng === location.lng) continue
      brand.location = { address: location.address }
    }
    stored.catalogVersion = 4
  }
  // Recommended matches are worked out from the catalogs now.
  delete (stored as { matches?: unknown }).matches
  stored.conversations ??= seedConversations()
  stored.inquiries ??= []
  stored.invites ??= []
  stored.agreements ??= []
  stored.reports ??= []
  stored.blocks ??= {}
  stored.saved ??= {}
  // Older data may have no demo accounts named yet.
  stored.posts ??= seedPosts(stored.demoAccountIds ?? {})
  freshenExamplePosts(stored)
  stored.reviews ??= seedReviews()
  // The demo busking day's survey, for data made before the survey.
  const surveyed = stored.measurements?.find((item) => item.eventId === "event-busking-day")
  if (surveyed) surveyed.survey ??= seedSurvey()
  if (stored.measurements && stored.sponsorships && stored.agreements && stored.demoAccountIds) {
    freshenDemoReport(stored as Parameters<typeof freshenDemoReport>[0])
  }
  // Sessions saved with their plain token keep working, stored as its hash.
  stored.sessions = (stored.sessions ?? []).map((session) => {
    const legacy = session as typeof session & { token?: string }
    if (!legacy.token) return session
    const { token, ...rest } = legacy
    return { ...rest, tokenHash: hashToken(token) }
  })
  const demoStudent = stored.accounts?.find(
    (account) => account.id === stored.demoAccountIds?.학생단체,
  )
  if (demoStudent) demoStudent.groupId ??= "syu-muse"
  // Account types from before the lists grew take their new names, on the
  // account and on its listing where it was named after the type.
  for (const account of stored.accounts ?? []) {
    const renamed = renamedAccountTypes[account.type]
    if (!renamed) continue
    const listingId = account.groupId ?? account.brandId
    const listing = (account.role === "학생단체" ? stored.groups : stored.brands)?.find((item) => item.id === listingId)
    if (listing?.category === account.type) listing.category = renamed
    account.type = renamed
  }
  if (demoStudent) demoStudent.contact ??= demoContacts.학생단체
  // Measurement used to be one global set for the busking day; it moves to
  // that event's own measurement, keeping the counts and records so far.
  if (!stored.measurements) {
    const legacy = stored as Database & { metrics?: Metrics; metricLog?: MetricEntry[]; report?: Report }
    stored.measurements = demoStudent ? seedMeasurements(demoStudent.id) : []
    const busking = stored.measurements[0]
    if (busking && legacy.metrics) busking.metrics = legacy.metrics
    if (busking && legacy.metricLog) busking.log = legacy.metricLog
    delete legacy.metrics
    delete legacy.metricLog
    delete legacy.report
  }
  stored.requests ??= seedRequests()
  stored.offers ??= seedOffers()
  const demoBrandId = stored.demoAccountIds?.브랜드
  stored.sponsorships ??= demoBrandId ? { [demoBrandId]: seedSponsorships() } : {}
  const demoBrand = stored.accounts?.find((account) => account.id === demoBrandId)
  if (demoBrand) demoBrand.brandId ??= "afternoon-coffee"
  if (demoBrand) demoBrand.contact ??= demoContacts.브랜드
  // Sponsorships saved before goals existed take the seeded goal, or
  // break-even for any other.
  const seededGoals = new Map(seedSponsorships().map((item) => [item.id, item.targetRoas]))
  for (const list of Object.values(stored.sponsorships)) {
    for (const sponsorship of list) {
      sponsorship.targetRoas ??= seededGoals.get(sponsorship.id) ?? 100
    }
  }
  // The demo brand's seeded campaign gained a budget.
  const tasting = demoBrandId
    ? stored.events?.[demoBrandId]?.find((event) => event.id === "event-coffee-tasting")
    : undefined
  if (tasting) tasting.budget ??= 800000
  // Brands pick their offers now; the demo brand's are its seeded ones.
  // Offers saved as plain kinds become rows.
  const demoListing = stored.brands?.find((brand) => brand.id === "afternoon-coffee")
  if (demoListing) demoListing.offers ??= seedBrands[0].offers
  for (const brand of stored.brands ?? []) {
    if (brand.offers) brand.offers = brand.offers.map((item) => (typeof item === "string" ? { kind: item } : item))
  }
  // The demo group's concert gained its event page.
  const demoGroupId = stored.demoAccountIds?.학생단체
  const concert = demoGroupId
    ? stored.events?.[demoGroupId]?.find((event) => event.id === "event-muse-concert")
    : undefined
  if (concert && !concert.packages) Object.assign(concert, museConcertPage)
  // Events no longer ask for the share of women; what was saved goes.
  for (const list of Object.values(stored.events ?? {})) {
    for (const event of list) {
      const makeup = event.makeup as (NonNullable<typeof event.makeup> & { female?: number }) | undefined
      if (makeup?.female === undefined) continue
      delete makeup.female
      if (!makeup.years?.length && !makeup.majors) delete event.makeup
    }
  }
  // The busking day's sponsorship follows that event's measurement.
  const busking = demoBrandId
    ? stored.sponsorships[demoBrandId]?.find((sponsorship) => sponsorship.id === "sp-busking")
    : undefined
  if (busking) busking.eventId ??= "event-busking-day"
  for (const events of Object.values(stored.events)) {
    for (const event of events) event.date = toIsoDate(event.date) ?? event.date
  }
  // Records made by the old demo test buttons read like real check-ins now.
  const testDetails: Record<string, string> = {
    "QR 스캔 테스트": "현장 QR 스캔",
    "쿠폰 수령 테스트": "아메리카노 1+1 쿠폰",
    "방문 확인 테스트": "매장 방문 확인",
  }
  for (const measurement of stored.measurements) {
    for (const entry of measurement.log) entry.detail = testDetails[entry.detail] ?? entry.detail
    // Visits need the staff PIN and a scan's pass now.
    measurement.staffPin ??= measurement.eventId === "event-busking-day" ? "1012" : newStaffPin()
    measurement.passes ??= {}
    // Venue counts and the group's venue PIN came with measurement methods.
    measurement.metrics = { ...emptyMetrics(), ...measurement.metrics }
    measurement.groupPin ??= measurement.eventId === "event-busking-day" ? "1013" : newStaffPin()
    // Each sponsor gets its own coupon and counts; an event's only sponsor
    // takes over what the event had.
    // A ROAS goal starts at 1%; 0 was once taken and cannot be divided by.
    if (measurement.goals.targets.roas < 1) measurement.goals.targets.roas = 100
    measurement.sponsors ??= []
    syncSponsors(stored, measurement)
    const { scans: _, ...noCounts } = emptyMetrics()
    for (const sponsor of measurement.sponsors) sponsor.metrics = { ...noCounts, ...sponsor.metrics }
    // Methods saved before they were split (the coupon then stood for the
    // QR, the coupon and the store's visits).
    for (const holder of [measurement, ...measurement.sponsors]) {
      if (holder.methods) holder.methods = upgradeMethods(holder.methods)
      if (holder.confirmedMethods) holder.confirmedMethods = upgradeMethods(holder.confirmedMethods)
    }
    // Scans by hour gained their day; older ones were on the event's first.
    const event = stored.events[measurement.accountId]?.find((item) => item.id === measurement.eventId)
    for (const slot of measurement.hourlyScans) slot.date ??= event?.date ?? ""
    // Participation records an event no longer needs go on each start.
    if (event) prunePasses(stored, measurement, event)
  }
  // E-contracts both sides confirmed before confirmed methods were kept
  // count the methods they hold as confirmed.
  for (const agreement of stored.agreements) {
    if (!agreement.confirmed?.group || !agreement.confirmed?.brand) continue
    const proposal = acceptedProposal(stored, agreement.id)
    const share = proposal && agreementShare(stored, proposal)
    const holder = share && (share.sponsor ?? share.measurement)
    if (holder?.methods && !holder.confirmedMethods) holder.confirmedMethods = holder.methods
  }
  return stored
}

export function getDatabase() {
  if (!database) throw new Error("loadDatabase() must run before handling requests")
  return database
}

// Writes are queued, each over the version this copy last read or wrote
// (lib/storage.ts makes a file write crash-safe and turns away a database
// write another copy beat). When a write fails, the data in memory goes back
// to what was last written, so a request answered with an error leaves
// nothing behind and can simply be tried again: its caller, and the callers
// of writes queued behind it (whose changes went back too), get a 503. When
// another copy wrote first, its data comes in for the next request. The
// queue carries on, so the next save tries again.
export function saveDatabase() {
  const storage = currentStorage()
  const snapshot = JSON.stringify(getDatabase(), null, storage.indent)
  const at = generation
  const write = pendingWrite.then(async () => {
    if (at !== generation) throw new HttpError(503, notSaved)
    try {
      version = await storage.write(snapshot, version)
      checkedAt = Date.now()
    } catch (error) {
      generation += 1
      rollBack()
      if (error instanceof StaleWrite) await reload().catch((caught: Error) => console.error(caught))
      else console.error(error)
      throw new HttpError(503, notSaved)
    }
    durable = snapshot
    await storage.backUp(snapshot)
  })
  pendingWrite = write.catch(() => {})
  return write
}

// Puts the last written data back in place.
function rollBack() {
  replace(JSON.parse(durable) as Database)
}
