import type { Campus } from "../data/campuses.js"
import { exampleShops } from "../data/exampleShops.js"
import type { Point } from "./geo.js"

export type NearbyPlace = {
  id: string
  name: string
  // Kakao가 주는 가장 구체적인 종류. 예: 커피전문점.
  category: string
  address: string
  phone?: string
  distanceM: number
  // Kakao Map에 있는 가게 페이지. 방문자에게 보이는 지어낸 가게는 없다.
  url?: string
  // 화면의 도식 지도에만 쓰는 위치(저장하지 않는다)와 가게를 찾은 종류
  // (validation.ts placeCategories).
  lat: number
  lng: number
  kind: string
  // 찾는 학생 단체 기준으로, 이 가게를 초대했다(routes/invites.ts).
  invited?: true
  // 초대를 받아 가입한 브랜드 리스팅.
  brandId?: string
}

// 캠퍼스 주변을 살피는 반경(m): 걸어서 약 20분.
export const placeRadius = 1500

// 한 번에 보여 주는 최대 수. 모든 종류를 합치면 최대 75곳을 찾는다.
export const placeLimit = 30

// Kakao Local의 카테고리 검색. 테스트가 스스로 답할 수 있게 따로 둔다.
export const placeSearch = {
  async search(category: string, point: Point, key: string): Promise<unknown> {
    const url = new URL("https://dapi.kakao.com/v2/local/search/category.json")
    url.searchParams.set("category_group_code", category)
    url.searchParams.set("x", String(point.lng))
    url.searchParams.set("y", String(point.lat))
    url.searchParams.set("radius", String(placeRadius))
    url.searchParams.set("sort", "distance")
    url.searchParams.set("size", "15")
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    // Kakao의 답에 이유가 있다. 예: 앱에서 Kakao Map을 켜지 않은 경우.
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
    return response.json()
  },
}

type KakaoPlace = {
  id?: string
  place_name?: string
  category_name?: string
  road_address_name?: string
  address_name?: string
  phone?: string
  distance?: string
  place_url?: string
  x?: string
  y?: string
}

// https인 Kakao Map 페이지 주소. 그 밖은 뺀다.
function kakaoMapPage(value: string | undefined) {
  try {
    const url = new URL(value ?? "")
    if (url.hostname !== "place.map.kakao.com") return undefined
    url.protocol = "https:"
    return url.href
  } catch {
    return undefined
  }
}

// Kakao 경로에서 가장 구체적인 종류("음식점 > 카페 > 커피전문점 >
// 이디야커피"). 이름이 되풀이하는 체인이면 그 위의 것을 쓴다.
function kindOf(path: string | undefined, name: string) {
  const kinds = (path ?? "").split(">").map((kind) => kind.trim()).filter(Boolean)
  const last = kinds.at(-1) ?? ""
  return kinds.length > 1 && name.includes(last) ? kinds.at(-2)! : last
}

// 캠퍼스 주변의 한 종류의 실제 장소를 가까운 순으로. Kakao는 Local 결과를
// 화면에 보여 주는 실시간 답으로만 허용하므로(저장도 캐시도 안 된다) 매번
// 다시 묻고 아무것도 남기지 않는다.
export async function nearbyPlaces(point: Point, category: string, key: string): Promise<NearbyPlace[]> {
  const answer = (await placeSearch.search(category, point, key)) as { documents?: KakaoPlace[] }
  return (answer.documents ?? [])
    .flatMap((place) => {
      const url = kakaoMapPage(place.place_url)
      const lat = Number(place.y)
      const lng = Number(place.x)
      if (!place.id || !place.place_name || !url || !Number.isFinite(lat) || !Number.isFinite(lng)) return []
      return [
        {
          id: place.id,
          name: place.place_name,
          category: kindOf(place.category_name, place.place_name),
          address: place.road_address_name || place.address_name || "",
          ...(place.phone ? { phone: place.phone } : {}),
          distanceM: Number(place.distance) || 0,
          url,
          lat,
          lng,
          kind: category,
        },
      ]
    })
    .sort((a, b) => a.distanceM - b.distanceM)
}

// 여러 종류에서 찾은 장소를 한 번씩, 가까운 순으로.
export function nearestPlaces(places: NearbyPlace[]) {
  const byId = new Map(places.map((place) => [place.id, place]))
  return [...byId.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, placeLimit)
}

// 방문자에게 보이는 지어낸 가게(data/exampleShops.ts)를 Kakao가 주는 것과
// 같은 모양으로 캠퍼스 주변에 둔다. 요청한 종류 중 가까운 순이며 지도
// 페이지와 전화번호는 없다.
export function exampleNearby(campus: Campus, kinds: readonly string[]): NearbyPlace[] {
  const metresPerDegree = 111_320
  const round = (degrees: number) => Math.round(degrees * 1e6) / 1e6
  return nearestPlaces(
    exampleShops
      .filter((shop) => kinds.includes(shop.kind))
      .map(({ id, name, category, kind, address, east, north }) => ({
        id,
        name,
        category,
        address: `${campus.name} ${address}`,
        distanceM: Math.round(Math.hypot(east, north)),
        lat: round(campus.lat + north / metresPerDegree),
        lng: round(campus.lng + east / (metresPerDegree * Math.cos((campus.lat * Math.PI) / 180))),
        kind,
      })),
  )
}
