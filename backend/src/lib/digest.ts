import { browse, ownerOf } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import { notify } from "./notices.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

// How far back a weekly digest looks for members who joined, and how many it names.
const weekMs = 7 * 24 * 60 * 60 * 1000
const named = 3

// Monday in Korea, when the digests go: the daily cron (09:00 in Korea) and
// a long-running server's hourly timer both call sendDigests.
const isMondayInKorea = (now: Date) => new Date(`${todayInKorea(now)}T00:00:00Z`).getUTCDay() === 1

// The listings of the other side that joined in the past week, as the
// account would find them (browse in lib/catalog.ts: the members it sees,
// without the paused, best match first), the best three.
export function newPartners(database: Database, account: Account, now = new Date()) {
  const catalog = account.role === "학생단체" ? "brands" : "groups"
  const since = now.getTime() - weekMs
  return browse(database, catalog, account)
    .filter((listing) => {
      const owner = ownerOf(database, catalog, listing)
      return owner !== undefined && Date.parse(owner.createdAt) >= since
    })
    .slice(0, named)
}

// Emails each member once a Monday about the partners that joined in the
// past week and fit it best, when there are any: not the shared demo
// accounts, suspended accounts, or members who turned the digest off in
// 내 정보 (digestOn keeps the Monday each account was looked at, so the
// hourly timer sends one). Answers how many went out.
export async function sendDigests(database: Database = getDatabase(), now = new Date()) {
  if (!isMondayInKorea(now)) return 0
  const today = todayInKorea(now)
  const demo = new Set(Object.values(database.demoAccountIds))
  const looked: Account[] = []
  const due: { account: Account; partners: ReturnType<typeof newPartners> }[] = []
  for (const account of database.accounts) {
    if (demo.has(account.id) || account.suspendedAt || account.digestOn === today) continue
    if (account.mailOff?.includes("digest")) continue
    account.digestOn = today
    looked.push(account)
    const partners = newPartners(database, account, now)
    if (partners.length > 0) due.push({ account, partners })
  }
  if (looked.length === 0) return 0
  await saveDatabase()
  for (const { account, partners } of due) {
    const students = account.role === "학생단체"
    const side = students ? "브랜드" : "학생단체"
    void notify(
      account,
      "digest",
      `이번 주 새로 가입한 잘 맞는 ${side} ${partners.length}곳`,
      [
        `지난 일주일 동안 가입한 ${side} 가운데 잘 맞는 곳이에요.`,
        ...partners.map((partner) => `· ${partner.name} (일치율 ${partner.score}%)`),
      ],
      students ? "/matches" : "/groups",
    )
  }
  return due.length
}
