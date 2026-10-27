import { randomInt } from "node:crypto"

import { acceptedProposalsOf } from "./agreements.js"
import { findListing } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import { statusOf } from "./proposals.js"
import type { Account, Database } from "../types.js"

// A student council (총학생회, 단과대 학생회, 학과 학생회) sees the clubs that
// linked to it with its code, read-only (routes/council.ts, pages/CouncilPage.tsx).
export const councilTypes = ["총학생회", "단과대 학생회", "학과 학생회"]
export const isCouncil = (account: Account) => account.role === "학생단체" && councilTypes.includes(account.type)

// How many councils one club links to at most (a department's, a college's
// and the university's).
export const councilsPerClub = 3

// A code like K7P2-QX9M, without letters that read alike.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
export function newCouncilCode() {
  const chars = Array.from({ length: 8 }, () => alphabet[randomInt(alphabet.length)]).join("")
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}
export const sameCode = (a: string, b: string) => a.toUpperCase().replace(/[^A-Z0-9]/g, "") === b.toUpperCase().replace(/[^A-Z0-9]/g, "")

// The clubs linked to a council.
export const clubsOf = (database: Database, council: Account) =>
  database.accounts.filter((account) => account.councils?.some((link) => link.accountId === council.id))

// What a council sees of one club: who it is, its coming events, how many
// proposals are open and how many became sponsorships, and its results so
// far in counts. Never its messages, contacts or agreements' contents.
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
