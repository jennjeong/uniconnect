import { todayInKorea } from "./dates.js"
import { distanceKm, offsetMetres, placeOf } from "./geo.js"
import { scoreMatch, type Viewer } from "./matchScore.js"
import { isDemoAccount, reviewSummary, reviewsAbout } from "./reviews.js"
import { blockedBetween } from "./safety.js"
import { isPro } from "./plan.js"
import type { Account, Database, Industry, Match, Role } from "../types.js"

// How an account's type (validation.ts) is filed among the industries the
// match and the marks use; the old names stay for data from before.
export const groupIndustries: Record<string, Industry> = {
  총학생회: "performance",
  "단과대 학생회": "performance",
  "학과 학생회": "performance",
  "축제 · 행사 기획단": "performance",
  "공연 동아리": "performance",
  "밴드 · 음악 동아리": "performance",
  "댄스 동아리": "performance",
  "연극 · 뮤지컬 동아리": "performance",
  "사진 · 영상 동아리": "photo",
  "학술 동아리": "education",
  "창업 · 경영 동아리": "education",
  "국제교류 · 어학 동아리": "education",
  "언론 · 방송 동아리": "content",
  "봉사 동아리": "wellness",
  "스포츠 동아리": "sports",
  "게임 · e스포츠 동아리": "content",
  "종교 동아리": "wellness",
  "연합 동아리": "content",
  "서포터즈 · 홍보대사": "content",
  학생회: "performance",
}

export const brandIndustries: Record<string, Industry> = {
  "카페 · 식음료": "cafe",
  "베이커리 · 디저트": "cafe",
  음식점: "cafe",
  "주점 · 펍": "cafe",
  "편의점 · 마트": "cafe",
  "뷰티 · 화장품": "beauty",
  "헤어 · 네일": "beauty",
  "패션 · 의류": "beauty",
  "사진 · 스튜디오": "photo",
  "콘텐츠 · 미디어": "content",
  "게임 · 엔터테인먼트": "content",
  "IT · 앱 서비스": "content",
  "교육 · 학원": "education",
  "출판 · 문구": "education",
  "문화 · 공연": "performance",
  "스포츠 · 피트니스": "sports",
  "헬스케어 · 웰니스": "wellness",
  "여행 · 숙박": "wellness",
  "금융 · 보험": "content",
  "생활용품 · 리빙": "wellness",
  "뷰티 · 패션": "beauty",
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
  // A suspended account shows to no one, and two accounts where one blocked
  // the other don't see each other.
  if (owner?.suspendedAt) return false
  if (owner && account && blockedBetween(database, owner.id, account.id)) return false
  const memberListing = owner !== undefined && !isDemoAccount(database, owner)
  const member = account !== undefined && !isDemoAccount(database, account)
  return memberListing === member
}

// The listings of a catalog that `account` (or a visitor) sees.
export const shownCatalog = (database: Database, catalog: "brands" | "groups", account?: Account) =>
  (catalog === "brands" ? database.brands : database.groups).filter((listing) =>
    shownTo(database, catalog, listing, account),
  )

// Whether `account` finds a listing in the lists: shown to it, and not taken
// out of them for now by its owner (pausedAt). What is under way with a
// paused listing still goes through shownTo.
export const listedTo = (database: Database, catalog: "brands" | "groups", listing: Match, account?: Account) =>
  !listing.pausedAt && shownTo(database, catalog, listing, account)

// The listings of a catalog that `account` (or a visitor) finds in the lists.
export const listedCatalog = (database: Database, catalog: "brands" | "groups", account?: Account) =>
  shownCatalog(database, catalog, account).filter((listing) => !listing.pausedAt)

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
  if (!next) return { ...group, eventId: undefined, eventName: undefined, eventDate: undefined, eventKind: undefined, audience: undefined }
  const audience = Number(next.people.replace(/\D/g, "")) || undefined
  return { ...group, eventId: next.id, eventName: next.name, eventDate: next.date, eventKind: next.kind, audience }
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

// A catalog as the other side finds it (members' listings for a member, the
// examples otherwise, as shownTo says, without the paused), best match first, each with its
// match for the viewer and why (lib/matchScore.ts), and how far it is from
// the viewer: a student's campus to a brand's store, a brand's store to a
// group's campus (lib/geo.ts), and which way, for the catalog map; its reviews' stars and count; and, for a
// brand, whether its business registration was confirmed.
export function browse(database: Database, catalog: "brands" | "groups", account?: Account) {
  const shown = listedCatalog(database, catalog, account)
  const listings = catalog === "brands" ? shown : shown.map((group) => withLiveEvent(database, group))
  const viewer = viewerFor(database, account, catalog)
  // A brand's track record counts against the brands seen beside it.
  const maxPopularity = Math.max(1, ...listedCatalog(database, "brands", account).map((brand) => brand.popularity ?? 0))
  const here = viewer && placeOf(viewer.listing, viewer.account)
  return listings
    .map((listing) => {
      const scored = viewer ? { ...listing, ...scoreMatch(database, viewer, listing, maxPopularity) } : listing
      const reviews = reviewSummary(reviewsAbout(database, listing.id))
      const rated = reviews.count ? { ...scored, rating: reviews.average, reviewCount: reviews.count } : scored
      const owner = ownerOf(database, catalog, listing)
      const verified = owner?.business ? { ...rated, businessVerified: true as const } : rated
      // A brand on Pro (lib/plan.ts) shows a PRO mark.
      const checked = catalog === "brands" && owner && isPro(database, owner.id) ? { ...verified, pro: true as const } : verified
      const there = placeOf(listing, owner)
      return here && there
        ? { ...checked, distanceKm: distanceKm(here, there), mapOffset: offsetMetres(here, there) }
        : checked
    })
    .sort((a, b) => b.score - a.score)
}
