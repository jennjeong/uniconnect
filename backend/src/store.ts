import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { config } from "./config.js"
import {
  createSeed,
  seedBrands,
  seedConversations,
  seedGroups,
  seedMetricLog,
  seedReport,
  seedRequests,
  seedSponsorships,
} from "./data/seed.js"
import { toIsoDate } from "./lib/dates.js"
import type { Database } from "./types.js"

// A JSON file stands in for a database so the prototype runs without any
// extra installs. Routes only touch data through getDatabase/saveDatabase,
// which is the seam to replace when moving to a real database.
let database: Database | undefined
let pendingWrite = Promise.resolve()

export async function loadDatabase() {
  try {
    const stored = JSON.parse(await readFile(config.dataFile, "utf8")) as Database
    database = upgradeDatabase(stored)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    database = await createSeed()
    await saveDatabase()
  }
  return database
}

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
  const demoStudent = stored.accounts?.find(
    (account) => account.id === stored.demoAccountIds?.학생단체,
  )
  if (demoStudent) demoStudent.groupId ??= "syu-muse"
  stored.metricLog ??= seedMetricLog()
  stored.report ??= structuredClone(seedReport)
  stored.requests ??= seedRequests()
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
  for (const events of Object.values(stored.events)) {
    for (const event of events) event.date = toIsoDate(event.date) ?? event.date
  }
  // Records made by the old demo test buttons read like real check-ins now.
  const testDetails: Record<string, string> = {
    "QR 스캔 테스트": "현장 QR 스캔",
    "쿠폰 수령 테스트": "아메리카노 1+1 쿠폰",
    "방문 확인 테스트": "매장 방문 확인",
  }
  for (const entry of stored.metricLog) entry.detail = testDetails[entry.detail] ?? entry.detail
  return stored
}

export function getDatabase() {
  if (!database) throw new Error("loadDatabase() must run before handling requests")
  return database
}

// Writes are queued and go through a temp file, so a crash mid-write cannot
// leave a half-written db.json behind.
export function saveDatabase() {
  const snapshot = JSON.stringify(getDatabase(), null, 2)
  pendingWrite = pendingWrite.then(async () => {
    await mkdir(path.dirname(config.dataFile), { recursive: true })
    const tempFile = `${config.dataFile}.tmp`
    await writeFile(tempFile, snapshot)
    await rename(tempFile, config.dataFile)
  })
  return pendingWrite
}
