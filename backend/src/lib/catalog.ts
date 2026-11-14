import { groupVerifiedNow } from "./groupCheck.js"
import { todayInKorea } from "./dates.js"
import { brandProfile } from "./brandProfile.js"
import { trustContext, trustOf } from "./trust.js"
import { distanceKm, offsetMetres, placeOf } from "./geo.js"
import { scoreMatch, type Viewer } from "./matchScore.js"
import { isDemoAccount, reviewSummary, reviewsAbout } from "./reviews.js"
import { blockedBetween } from "./safety.js"
import { adUntil, isPro } from "./plan.js"
import { ownerOf, ownersOf } from "./owners.js"
import type { Account, Database, Industry, Match, Role } from "../types.js"

// 계정 유형(validation.ts)을 매칭과 마크가 쓰는 업종 중 어디에 넣는지.
// 이전 데이터를 위해 옛 이름도 남겨 둔다.
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

// `role` 계정이 올라가는 카탈로그와 그 계정이 둘러보는 카탈로그.
export const ownCatalog = (database: Database, role: Role) =>
  role === "학생단체" ? database.groups : database.brands

export const listingIdOf = (account: Account) =>
  account.role === "학생단체" ? account.groupId : account.brandId

export function findListing(database: Database, account: Account) {
  const id = listingIdOf(account)
  return id ? ownCatalog(database, account.role).find((listing) => listing.id === id) : undefined
}

// 리스팅의 주인 찾기는 lib/owners.ts에 있다.
export { listingOwner, ownerOf, ownersOf, partnerCatalogOf } from "./owners.js"

// 회원(가입한 계정)은 다른 회원의 리스팅만 본다. 시드 카탈로그와 데모
// 계정의 리스팅은 예시로, 방문자와 공용 데모 계정이 본다. 둘은 만나지 않는다.
// 만든 것이 회원에게 닿지 않고 데모 계정도 회원에게 닿지 않는다.
export function shownTo(database: Database, catalog: "brands" | "groups", listing: Match, account?: Account) {
  const owner = ownerOf(database, catalog, listing.id)
  // 정지된 계정은 누구에게도 보이지 않고, 한쪽이 상대를 차단한 두 계정은
  // 서로 보이지 않는다.
  if (owner?.suspendedAt) return false
  if (owner && account && blockedBetween(database, owner.id, account.id)) return false
  const memberListing = owner !== undefined && !isDemoAccount(database, owner)
  const member = account !== undefined && !isDemoAccount(database, account)
  return memberListing === member
}

// `account`(또는 방문자)가 보는 카탈로그의 리스팅.
export const shownCatalog = (database: Database, catalog: "brands" | "groups", account?: Account) =>
  (catalog === "brands" ? database.brands : database.groups).filter((listing) =>
    shownTo(database, catalog, listing, account),
  )

// `account`가 목록에서 리스팅을 찾을 수 있는지: 보이는 것이고 주인이
// 잠시 목록에서 뺀(pausedAt) 것이 아니어야 한다. 멈춘 리스팅과 진행 중인
// 일은 여전히 shownTo를 거친다.
export const listedTo = (database: Database, catalog: "brands" | "groups", listing: Match, account?: Account) =>
  !listing.pausedAt && shownTo(database, catalog, listing, account)

// `account`(또는 방문자)가 목록에서 찾는 카탈로그의 리스팅.
export const listedCatalog = (database: Database, catalog: "brands" | "groups", account?: Account) =>
  shownCatalog(database, catalog, account).filter((listing) => !listing.pausedAt)

// 계정 유형으로 정하는 업종. 표에 없는 유형은 단체면 공연, 브랜드면 카페다.
export const industryOf = (account: Account): Industry =>
  account.role === "학생단체" ? (groupIndustries[account.type] ?? "performance") : (brandIndustries[account.type] ?? "cafe")

// 새 계정이 소개를 쓰면 상대편이 찾을 수 있게 리스팅을 올린다. 매칭
// 데이터가 생기기 전까지 점수는 70에서 시작한다.
export function createListing(database: Database, account: Account): Match {
  const students = account.role === "학생단체"
  const listing: Match = {
    id: `${students ? "group" : "brand"}-${account.id}`,
    name: account.name,
    category: account.type,
    industry: industryOf(account),
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

// 계정이 있는 단체는 그 계정 캘린더의 다음 행사를 보여 준다.
export function withLiveEvent(database: Database, group: Match): Match {
  const account = ownerOf(database, "groups", group.id)
  if (!account) return group
  const today = todayInKorea()
  const next = (database.events[account.id] ?? [])
    // 여러 날에 걸친 행사는 마지막 날까지 다음 행사로 남는다.
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  if (!next) return { ...group, eventId: undefined, eventName: undefined, eventDate: undefined, eventKind: undefined, audience: undefined }
  const audience = Number(next.people.replace(/\D/g, "")) || undefined
  return { ...group, eventId: next.id, eventName: next.name, eventDate: next.date, eventKind: next.kind, audience }
}

// 카탈로그가 누구를 위해 매칭되는지: 상대편을 둘러보는 로그인 계정, 아니면
// 그쪽의 데모 계정(방문자는 미리 본다).
export function viewerFor(database: Database, account: Account | undefined, catalog: "brands" | "groups"): Viewer | undefined {
  const role: Role = catalog === "brands" ? "학생단체" : "브랜드"
  const viewer =
    account?.role === role
      ? account
      : database.accounts.find((item) => item.id === database.demoAccountIds[role])
  return viewer && { account: viewer, listing: findListing(database, viewer) }
}

// 상대편이 찾는 카탈로그(회원에게는 회원의 리스팅, 그 밖에는 shownTo가
// 말하는 예시, 멈춘 것은 뺀다). 가장 잘 맞는 순으로 두고 각각에 보는 사람
// 기준의 매칭과 이유(lib/matchScore.ts), 보는 사람과의 거리(학생의 캠퍼스
// 에서 브랜드 매장, 브랜드 매장에서 단체 캠퍼스, lib/geo.ts)와 방향(카탈로그
// 지도용), 후기의 별점과 수를 담고, 브랜드는 사업자 등록 확인 여부도 담는다.
export function browse(database: Database, catalog: "brands" | "groups", account?: Account) {
  const shown = listedCatalog(database, catalog, account)
  const listings =
    catalog === "brands" ? shown.map((brand) => brandProfile(database, brand)) : shown.map((group) => withLiveEvent(database, group))
  const viewer = viewerFor(database, account, catalog)
  // 브랜드의 실적은 함께 보이는 브랜드와 견주어 센다. 브랜드 목록이면 shown이 바로 그것이다.
  const brands = catalog === "brands" ? shown : listedCatalog(database, "brands", account)
  const maxPopularity = Math.max(1, ...brands.map((brand) => brand.popularity ?? 0))
  const here = viewer && placeOf(viewer.listing, viewer.account)
  // 리스팅마다 계정 전체를 다시 훑지 않도록 주인과 지표의 재료를 한 번 만든다.
  const owners = ownersOf(database, catalog)
  const today = todayInKorea()
  const trusted = trustContext(database)
  return listings
    .map((listing) => {
      const reviews = reviewSummary(reviewsAbout(database, listing.id))
      const owner = owners.get(listing.id)
      // 회원의 응답률과 이행률(lib/trust.ts)이다. 예시와 데모 계정에는 없다.
      const trust = trustOf(database, owner, today, trusted)
      const there = placeOf(listing, owner)
      return {
        ...listing,
        ...(viewer ? scoreMatch(database, viewer, listing, maxPopularity) : {}),
        ...(reviews.count ? { rating: reviews.average, reviewCount: reviews.count } : {}),
        ...(owner?.business ? { businessVerified: true as const } : {}),
        ...(owner && groupVerifiedNow(owner) ? { groupVerified: true as const } : {}),
        // Pro 브랜드(lib/plan.ts)는 PRO 마크를 보인다.
        ...(catalog === "brands" && owner && isPro(database, owner.id) ? { pro: true as const } : {}),
        // 진행 중인 상단 광고(lib/ads.ts)는 맨 앞에 두고 AD로 표시한다.
        ...(owner && adUntil(database, owner.id) ? { ad: true as const } : {}),
        ...(trust ? { trust } : {}),
        ...(here && there ? { distanceKm: distanceKm(here, there), mapOffset: offsetMetres(here, there), mapPoint: { lat: there.lat, lng: there.lng } } : {}),
      }
    })
    .sort((a, b) => Number(b.ad === true) - Number(a.ad === true) || b.score - a.score)
}
