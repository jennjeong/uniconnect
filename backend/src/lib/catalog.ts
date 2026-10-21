import type { Account, Database, Industry, Match, Role } from "../types.js"

// How an account's type is filed among the industries.
export const groupIndustries: Record<string, Industry> = {
  "공연 동아리": "performance",
  "학술 동아리": "education",
  "봉사 동아리": "wellness",
  학생회: "performance",
  "연합 동아리": "content",
}

const brandIndustries: Record<string, Industry> = {
  "카페 · 식음료": "cafe",
  "뷰티 · 패션": "beauty",
  "콘텐츠 · 미디어": "content",
  "스포츠 · 웰니스": "sports",
  교육: "education",
}

// The catalog an account of `role` is listed in, and the one it browses.
export const ownCatalog = (database: Database, role: Role) =>
  role === "학생단체" ? database.groups : database.brands

export const partnerCatalog = (database: Database, role: Role) =>
  role === "학생단체" ? database.brands : database.groups

export const listingIdOf = (account: Account) =>
  account.role === "학생단체" ? account.groupId : account.brandId

export function findListing(database: Database, account: Account) {
  const id = listingIdOf(account)
  return id ? ownCatalog(database, account.role).find((listing) => listing.id === id) : undefined
}

// Lists a new account so the other side can find it, once it has written
// its introduction. Its score starts at 70 until there is matching data.
export function createListing(database: Database, account: Account): Match {
  const students = account.role === "학생단체"
  const listing: Match = {
    id: `${students ? "group" : "brand"}-${account.id}`,
    name: account.name,
    category: account.type,
    industry: (students ? groupIndustries : brandIndustries)[account.type] ?? (students ? "performance" : "cafe"),
    offer: "",
    score: 70,
    tags: [],
    ...(students ? { school: account.school } : { popularity: 0 }),
  }
  ownCatalog(database, account.role).push(listing)
  if (students) account.groupId = listing.id
  else account.brandId = listing.id
  return listing
}

// A group with an account shows that account's next event from its calendar.
export function withLiveEvent(database: Database, group: Match): Match {
  const account = database.accounts.find((item) => item.groupId === group.id)
  if (!account) return group
  const today = new Date().toISOString().slice(0, 10)
  const next = (database.events[account.id] ?? [])
    // An event over several days stays next until its last day.
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!next) return { ...group, eventName: undefined, eventDate: undefined, audience: undefined }
  const audience = Number(next.people.replace(/\D/g, "")) || undefined
  return { ...group, eventName: next.name, eventDate: next.date, audience }
}

// A catalog as the other side sees it, best match first.
export function browse(database: Database, catalog: "brands" | "groups") {
  const listings =
    catalog === "brands"
      ? database.brands
      : database.groups.map((group) => withLiveEvent(database, group))
  return [...listings].sort((a, b) => b.score - a.score)
}
