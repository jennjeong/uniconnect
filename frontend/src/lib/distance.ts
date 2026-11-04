import type { Match } from "../types"

// 1km 미만은 "800m", 그 이상은 "3.5km" (정수면 "12km").
export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m`
  return `${Number.isInteger(km) ? km : km.toFixed(1)}km`
}

// 보여줄 리스팅의 태그. 실제 거리가 옆에 나오면 자체 반경을 말하는 태그("반경
// 1.2km")는 그것과 모순되므로 뺀다.
export function shownTags(listing: Pick<Match, "tags" | "distanceKm">) {
  if (listing.distanceKm === undefined) return listing.tags
  return listing.tags.filter((tag) => !/^반경\s*\d/.test(tag))
}

// 가까운 순으로 정렬한 리스팅. 거리가 없는 것(온라인 브랜드, 지도에 없는
// 학교)은 그 뒤에 원래 순서대로 둔다.
export function nearestFirst<T extends Pick<Match, "distanceKm">>(listings: T[]) {
  const placed = listings.filter((listing) => listing.distanceKm !== undefined)
  const unplaced = listings.filter((listing) => listing.distanceKm === undefined)
  return [...placed.sort((a, b) => a.distanceKm! - b.distanceKm!), ...unplaced]
}
