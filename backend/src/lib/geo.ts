import { campuses, type Campus } from "../data/campuses.js"
import type { Account, Match } from "../types.js"

export type Point = { lat: number; lng: number }

// 두 지점 사이의 직선거리(km, haversine), 0.1km 단위.
export function distanceKm(a: Point, b: Point) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10
}

// `from`에서 본 `to`의 위치를 동쪽과 북쪽 미터로, 평면 지구로 계산해
// (도식에는 충분하다) 10m 단위로 낸다. 카탈로그 지도의 점이다(CatalogMap.tsx).
export function offsetMetres(from: Point, to: Point) {
  const metresPerDegree = 111_320
  const east = (to.lng - from.lng) * metresPerDegree * Math.cos((from.lat * Math.PI) / 180)
  const north = (to.lat - from.lat) * metresPerDegree
  return { east: Math.round(east / 10) * 10, north: Math.round(north / 10) * 10 }
}

// 학교의 캠퍼스: 인증한 이메일 도메인(또는 그 하위 도메인)으로 찾고, 없으면
// 학교 이름으로 찾는다. 표에 없는 학교는 undefined다.
export function campusOf({ email, school }: { email?: string; school?: string }): Campus | undefined {
  const domain = email?.split("@")[1]?.toLowerCase()
  const byDomain =
    domain && campuses.find((campus) => campus.domains.some((item) => domain === item || domain.endsWith(`.${item}`)))
  return byDomain || campuses.find((campus) => campus.name === school?.trim())
}

// 리스팅(또는 리스팅이 없는 계정)의 위치: 브랜드는 매장, 학생 단체는
// 캠퍼스다. 계정의 이메일이 있으면 그것으로, 없으면 적힌 학교로 찾는다.
export function placeOf(listing: Pick<Match, "location" | "school"> | undefined, account?: Account): Point | undefined {
  const location = listing?.location
  if (location?.lat !== undefined && location.lng !== undefined) return { lat: location.lat, lng: location.lng }
  if (listing?.school !== undefined || account?.role === "학생단체") {
    return campusOf({ email: account?.email, school: listing?.school ?? account?.school })
  }
  return undefined
}
