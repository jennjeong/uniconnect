import type { Point } from "./geo.js"

export type NearbyPlace = {
  id: string
  name: string
  // The most specific kind Kakao gives, such as 커피전문점.
  category: string
  address: string
  phone?: string
  distanceM: number
  // The place's page on Kakao Map.
  url: string
}

// How far around a campus to look, in metres: about a 20-minute walk.
export const placeRadius = 1500

// The most one look shows; every kind together finds up to 75.
export const placeLimit = 30

// Kakao Local's category search, kept apart so tests can answer it themselves.
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
    // Kakao's answer says why, such as Kakao Map not being switched on for the app.
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
}

// A place's Kakao Map page over https; anything else is left out.
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

// The most specific kind in Kakao's path ("음식점 > 카페 > 커피전문점 >
// 이디야커피"), or the one above it when that is a chain the name repeats.
function kindOf(path: string | undefined, name: string) {
  const kinds = (path ?? "").split(">").map((kind) => kind.trim()).filter(Boolean)
  const last = kinds.at(-1) ?? ""
  return kinds.length > 1 && name.includes(last) ? kinds.at(-2)! : last
}

// Real places of one kind around a campus, nearest first. Kakao allows its
// Local results only as live answers shown on screen (no storing, not even
// caching), so every call asks again and nothing is kept.
export async function nearbyPlaces(point: Point, category: string, key: string): Promise<NearbyPlace[]> {
  const answer = (await placeSearch.search(category, point, key)) as { documents?: KakaoPlace[] }
  return (answer.documents ?? [])
    .flatMap((place) => {
      const url = kakaoMapPage(place.place_url)
      if (!place.id || !place.place_name || !url) return []
      return [
        {
          id: place.id,
          name: place.place_name,
          category: kindOf(place.category_name, place.place_name),
          address: place.road_address_name || place.address_name || "",
          ...(place.phone ? { phone: place.phone } : {}),
          distanceM: Number(place.distance) || 0,
          url,
        },
      ]
    })
    .sort((a, b) => a.distanceM - b.distanceM)
}

// Places found under several kinds, each once, the nearest first.
export function nearestPlaces(places: NearbyPlace[]) {
  const byId = new Map(places.map((place) => [place.id, place]))
  return [...byId.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, placeLimit)
}
