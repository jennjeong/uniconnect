import { randomInt } from "node:crypto"

import { acceptedProposalsOf } from "./agreements.js"
import { findListing } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import { statusOf } from "./proposals.js"
import type { Account, Database } from "../types.js"

// 학생회(총학생회, 단과대 학생회, 학과 학생회)는 자기 코드로 연결한 동아리를
// 읽기 전용으로 본다(routes/council.ts, pages/CouncilPage.tsx).
export const councilTypes = ["총학생회", "단과대 학생회", "학과 학생회"]
export const isCouncil = (account: Account) => account.role === "학생단체" && councilTypes.includes(account.type)

// 동아리 하나가 연결할 수 있는 학생회의 최대 수(학과, 단과대, 대학).
export const councilsPerClub = 3

// K7P2-QX9M 같은 코드. 헷갈리는 글자는 뺀다.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export function newCouncilCode() {
  const chars = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("")
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}
export const sameCode = (a: string, b: string) => a.toUpperCase().replace(/[^A-Z0-9]/g, "") === b.toUpperCase().replace(/[^A-Z0-9]/g, "")

// 학생회에 연결된 동아리.
export const clubsOf = (database: Database, council: Account) =>
  database.accounts.filter((account) => account.councils?.some((link) => link.accountId === council.id))

// 학생회가 동아리 하나에 대해 보는 것: 누구인지, 다가오는 행사, 열린 제안과
// 협찬이 된 제안의 수, 지금까지의 결과(집계). 메시지, 연락처, 계약서 내용은
// 절대 보지 않는다.
export function clubSummary(database: Database, club: Account, council: Account) {
  const today = todayInKorea()
  const listing = findListing(database, club)
  const events = (database.events[club.id] ?? [])
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const proposals = [
    ...database.requests.filter((item) => item.fromAccountId === club.id),
    ...(club.groupId ? database.offers.filter((item) => item.groupId === club.groupId) : []),
  ]
  const results = database.measurements
    .filter((item) => item.accountId === club.id)
    .reduce(
      (sum, item) => ({
        scans: sum.scans + item.metrics.scans,
        coupons: sum.coupons + item.metrics.coupons,
        visits: sum.visits + item.metrics.visits,
      }),
      { scans: 0, coupons: 0, visits: 0 },
    )
  return {
    id: club.id,
    name: listing?.name ?? club.name,
    type: club.type,
    school: club.school,
    ...(listing ? { listingId: listing.id, industry: listing.industry, ...(listing.logo ? { logo: listing.logo } : {}) } : {}),
    linkedAt: club.councils!.find((link) => link.accountId === council.id)!.linkedAt,
    events: events.slice(0, 5).map(({ id, name, date, endDate, people }) => ({ id, name, date, endDate, people })),
    eventCount: events.length,
    openProposals: proposals.filter((item) => statusOf(database, item, today) === "검토 중").length,
    sponsorships: acceptedProposalsOf(database, club).length,
    results,
  }
}
