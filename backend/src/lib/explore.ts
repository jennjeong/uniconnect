import { findListing, shownTo } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import type { Account, Database } from "../types.js"

// 목록이 보여 주는 행사 소개의 길이.
const introLength = 220

// 보는 사람이 보는 학생 단체(회원은 회원을, 방문자와 데모 계정은 예시를
// 본다)와 그 계정, 리스팅, 보는 사람 자신의 단체.
function groupsSeen(database: Database, viewer?: Account) {
  return database.accounts.flatMap((owner) => {
    if (owner.role !== "학생단체") return []
    const listing = findListing(database, owner)
    if (!listing) return []
    const own = viewer?.id === owner.id
    return own || shownTo(database, "groups", listing, viewer) ? [{ owner, listing, own }] : []
  })
}

// 행사 둘러보기: 보는 사람이 보는 단체의 다가오는 모든 행사를 임박한 순으로
// 두고 브랜드에 주는 것을 붙여, 단체끼리 서로 배우게 한다.
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

// 목록에서 가장 많은 항목을 `count`개까지.
function top(values: string[], count: number) {
  const tally = new Map<string, number>()
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1)
  return [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, count).map(([value]) => value)
}

// 비슷한 행사의 협찬 사례: 행사 종류마다 보는 사람이 보는 단체들이 확정한
// 협찬(수락되고 취소되지 않은 것)의 수, 평균 참석자 수, 브랜드의 업종,
// 가장 많이 요청한 것. 이름 없이 집계만 담는다.
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
