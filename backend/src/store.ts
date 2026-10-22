import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "./config.js"
import {
  createSeed,
  seedBrands,
  seedConversations,
  seedGroups,
  seedMeasurements,
  seedOffers,
  seedRequests,
  seedSponsorships,
} from "./data/seed.js"
import { toIsoDate } from "./lib/dates.js"
import { HttpError } from "./lib/errors.js"
import { newStaffPin, syncSponsors } from "./lib/measurements.js"
import { hashToken } from "./middleware/session.js"
import type { Database, Metrics, MetricEntry, Report } from "./types.js"

// A JSON file stands in for a database so the prototype runs without any
// extra installs. Routes only touch data through getDatabase/saveDatabase,
// which is the seam to replace when moving to a real database.
let database: Database | undefined
let pendingWrite = Promise.resolve()
// The data as last written, to go back to when a write fails, and a count
// that moves on each time one does.
let durable = ""
let generation = 0

export async function loadDatabase() {
  try {
    const stored = JSON.parse(await readFile(config.dataFile, "utf8")) as Database
    database = upgradeDatabase(stored)
    durable = JSON.stringify(database, null, 2)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    database = await createSeed()
    for (const measurement of database.measurements) syncSponsors(database, measurement)
    durable = JSON.stringify(database, null, 2)
    await saveDatabase()
  }
  return database
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
  // Recommended matches are worked out from the catalogs now.
  delete (stored as { matches?: unknown }).matches
  stored.conversations ??= seedConversations()
  stored.inquiries ??= []
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
    // Each sponsor gets its own coupon and counts; an event's only sponsor
    // takes over what the event had.
    measurement.sponsors ??= []
    syncSponsors(stored, measurement)
  }
  return stored
}

export function getDatabase() {
  if (!database) throw new Error("loadDatabase() must run before handling requests")
  return database
}

// Writes are queued and go through a temp file, so a crash mid-write cannot
// leave a half-written db.json behind. When a write fails, the data in
// memory goes back to what was last written, so a request answered with an
// error leaves nothing behind and can simply be tried again: its caller,
// and the callers of writes queued behind it (whose changes went back too),
// get a 503. The queue carries on, so the next save tries again.
export function saveDatabase() {
  const snapshot = JSON.stringify(getDatabase(), null, 2)
  const at = generation
  const write = pendingWrite.then(async () => {
    if (at !== generation) throw new HttpError(503, notSaved)
    try {
      await mkdir(path.dirname(config.dataFile), { recursive: true })
      const tempFile = `${config.dataFile}.tmp`
      await writeFile(tempFile, snapshot)
      await rename(tempFile, config.dataFile)
    } catch (error) {
      console.error(error)
      generation += 1
      rollBack()
      throw new HttpError(503, notSaved)
    }
    durable = snapshot
  })
  pendingWrite = write.catch(() => {})
  return write
}

// Puts the last written data back in place, in the same object, so code
// holding the database sees it.
function rollBack() {
  const current = getDatabase() as unknown as Record<string, unknown>
  for (const key of Object.keys(current)) delete current[key]
  Object.assign(current, JSON.parse(durable))
}
