import { todayInKorea } from "./dates.js"
import { distanceKm, placeOf } from "./geo.js"
import { scoreMatch, type Viewer } from "./matchScore.js"
import { isDemoAccount, reviewSummary, reviewsAbout } from "./reviews.js"
import type { Account, Database, Industry, Match, Role } from "../types.js"

// How an account's type is filed among the industries.
export const groupIndustries: Record<string, Industry> = {
  "공연 동아리": "performance",
  "학술 동아리": "education",
  "봉사 동아리": "wellness",
  학생회: "performance",
  "연합 동아리": "content",
}

export const brandIndustries: Record<string, Industry> = {
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

// The account a listing belongs to; the seed catalog's belong to none.
export const ownerOf = (database: Database, catalog: "brands" | "groups", listing: Match) =>
  database.accounts.find((item) => (catalog === "brands" ? item.brandId : item.groupId) === listing.id)

// Members (accounts that signed up) see only each other's listings. The
// seed catalog and the demo accounts' listings make up the examples, which
// visitors and the shared demo accounts see. The two never meet: nothing
// made up reaches a member, and a demo account reaches no member.
export function shownTo(database: Database, catalog: "brands" | "groups", listing: Match, account?: Account) {
  const owner = ownerOf(database, catalog, listing)
  const memberListing = owner !== undefined && !isDemoAccount(database, owner)
  const member = account !== undefined && !isDemoAccount(database, account)
  return memberListing === member
}

// The listings of a catalog that `account` (or a visitor) sees.
export const shownCatalog = (database: Database, catalog: "brands" | "groups", account?: Account) =>
  (catalog === "brands" ? database.brands : database.groups).filter((listing) =>
    shownTo(database, catalog, listing, account),
  )

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
  const today = todayInKorea()
  const next = (database.events[account.id] ?? [])
    // An event over several days stays next until its last day.
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!next) return { ...group, eventName: undefined, eventDate: undefined, audience: undefined }
  const audience = Number(next.people.replace(/\D/g, "")) || undefined
  return { ...group, eventName: next.name, eventDate: next.date, audience }
}

// Who a catalog is matched for: the logged-in account when it browses the
// other side, otherwise the demo account of that side (visitors preview it).
export function viewerFor(database: Database, account: Account | undefined, catalog: "brands" | "groups"): Viewer | undefined {
  const role: Role = catalog === "brands" ? "학생단체" : "브랜드"
  const viewer =
    account?.role === role
      ? account
      : database.accounts.find((item) => item.id === database.demoAccountIds[role])
  return viewer && { account: viewer, listing: findListing(database, viewer) }
}

// A catalog as the other side sees it (members' listings for a member, the
// examples otherwise, as shownTo says), best match first, each with its
// match for the viewer and why (lib/matchScore.ts), and how far it is from
// the viewer: a student's campus to a brand's store, a brand's store to a
// group's campus (lib/geo.ts); and its reviews' stars and count.
export function browse(database: Database, catalog: "brands" | "groups", account?: Account) {
  const shown = shownCatalog(database, catalog, account)
  const listings = catalog === "brands" ? shown : shown.map((group) => withLiveEvent(database, group))
  const viewer = viewerFor(database, account, catalog)
  // A brand's track record counts against the brands seen beside it.
  const maxPopularity = Math.max(1, ...shownCatalog(database, "brands", account).map((brand) => brand.popularity ?? 0))
  const here = viewer && placeOf(viewer.listing, viewer.account)
  return listings
    .map((listing) => {
      const scored = viewer ? { ...listing, ...scoreMatch(database, viewer, listing, maxPopularity) } : listing
      const reviews = reviewSummary(reviewsAbout(database, listing.id))
      const rated = reviews.count ? { ...scored, rating: reviews.average, reviewCount: reviews.count } : scored
      const there = placeOf(listing, ownerOf(database, catalog, listing))
      return here && there ? { ...rated, distanceKm: distanceKm(here, there) } : rated
    })
    .sort((a, b) => b.score - a.score)
}
