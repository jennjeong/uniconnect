import { findListing, shownTo } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import type { Account, Database } from "../types.js"

// How much of an event's introduction the list shows.
const introLength = 220

// The student groups the viewer sees (members see members, visitors and the
// demo accounts the examples), with their accounts and listings, and the
// viewer's own group.
function groupsSeen(database: Database, viewer?: Account) {
  return database.accounts.flatMap((owner) => {
    if (owner.role !== "학생단체") return []
    const listing = findListing(database, owner)
    if (!listing) return []
    const own = viewer?.id === owner.id
    return own || shownTo(database, "groups", listing, viewer) ? [{ owner, listing, own }] : []
  })
}

// 행사 둘러보기: every coming event of the groups the viewer sees, soonest
// first, with what it offers brands, so groups learn from each other's.
export function exploreEvents(database: Database, viewer?: Account) {
  const today = todayInKorea()
  return groupsSeen(database, viewer)
    .flatMap(({ owner, listing, own }) =>
      (database.events[owner.id] ?? [])
        .filter((event) => (event.endDate ?? event.date) >= today)
        .map((event) => ({
          id: event.id,
          name: event.name,
          date: event.date,
          ...(event.endDate ? { endDate: event.endDate } : {}),
          ...(event.kind ? { kind: event.kind } : {}),
          people: event.people,
          ...(event.venue ? { venue: event.venue } : {}),
          ...(event.intro ? { intro: event.intro.slice(0, introLength) } : {}),
          packages: (event.packages ?? []).slice(0, 4).map(({ name, gives }) => ({ name, gives })),
          ...(event.promo ? { promo: { spots: event.promo.spots, handouts: event.promo.handouts, posts: event.promo.posts } } : {}),
          group: { id: listing.id, name: listing.name, school: listing.school ?? owner.school, category: listing.category, type: owner.type },
          ...(own ? { own: true } : {}),
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 120)
}

// The most frequent of a list, as many as `count`.
function top(values: string[], count: number) {
  const tally = new Map<string, number>()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count).map(([value]) => value)
}

// 비슷한 행사의 협찬 사례: for each kind of event, the sponsorships the groups
// the viewer sees had confirmed for one (accepted, not called off): how
// many, how many came on average, the brands' industries and what was asked
// most. Counts only, without names.
export function eventCases(database: Database, viewer?: Account) {
  const byKind = new Map<string, { people: number[]; industries: string[]; asks: string[]; count: number }>()
  for (const { owner } of groupsSeen(database, viewer)) {
    const events = database.events[owner.id] ?? []
    for (const request of database.requests) {
      if (request.fromAccountId !== owner.id || request.status !== "수락" || request.canceledAt) continue
      const event = events.find((item) => item.id === request.eventId)
      if (!event?.kind) continue
      const entry = byKind.get(event.kind) ?? { people: [], industries: [], asks: [], count: 0 }
      entry.count += 1
      const people = Number(event.people.replace(/\D/g, ""))
      if (people) entry.people.push(people)
      const brand = database.brands.find((item) => item.id === request.brandId)
      if (brand) entry.industries.push(brand.industry)
      const ask = request.ask.trim().slice(0, 30)
      if (ask) entry.asks.push(ask)
      byKind.set(event.kind, entry)
    }
  }
  return [...byKind.entries()]
    .map(([kind, entry]) => ({
      kind,
      sponsorships: entry.count,
      ...(entry.people.length ? { averagePeople: Math.round(entry.people.reduce((sum, value) => sum + value, 0) / entry.people.length) } : {}),
      industries: top(entry.industries, 3),
      asks: top(entry.asks, 3),
    }))
    .sort((a, b) => b.sponsorships - a.sponsorships)
}
