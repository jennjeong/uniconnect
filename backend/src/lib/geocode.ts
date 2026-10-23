import { config } from "../config.js"
import type { Point } from "./geo.js"

// The request to Kakao Local's address search, kept apart so tests can
// answer it themselves.
export const geocoder = {
  async search(address: string, key: string): Promise<unknown> {
    const url = new URL("https://dapi.kakao.com/v2/local/search/address.json")
    url.searchParams.set("query", address)
    const response = await fetch(url, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    // Kakao's answer says why, such as Kakao Map not being switched on for the app.
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
    return response.json()
  },
}

// A store address as coordinates, through Kakao Local once KAKAO_REST_API_KEY
// is set. Undefined without the key, for an address it can't find, or when
// the service can't be reached: the address is kept and has no distance.
export async function geocode(address: string): Promise<Point | undefined> {
  if (!config.kakaoRestApiKey) return undefined
  try {
    const answer = (await geocoder.search(address, config.kakaoRestApiKey)) as {
      documents?: { x?: string; y?: string }[]
    }
    const first = answer.documents?.[0]
    const lat = Number(first?.y)
    const lng = Number(first?.x)
    return Number.isFinite(lat) && Number.isFinite(lng) && first?.x && first?.y ? { lat, lng } : undefined
  } catch (error) {
    console.error(`[geocode] Kakao address search: ${(error as Error).message}`)
    return undefined
  }
}
