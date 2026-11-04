import { config } from "../config.js"
import type { Point } from "./geo.js"

// OpenStreetMap의 공개 Nominatim은 애플리케이션마다 초당 한 건만 받으므로
// 조회는 차례를 기다린다.
const spacingMs = 1100
let nextAt = 0

// OpenStreetMap Nominatim 검색(NOMINATIM_URL)에 보내는 요청. 테스트가 스스로
// 답할 수 있게 따로 둔다. Kakao나 VWorld의 지오코더는 실시간 사용만 허용
// 하지만 이쪽의 답은 보관해도 된다(ODbL, 푸터에 "© OpenStreetMap
// contributors"를 표시).
export const geocoder = {
  async search(address: string, base: string): Promise<unknown> {
    const start = Math.max(Date.now(), nextAt)
    nextAt = start + spacingMs
    if (start > Date.now()) await new Promise((resolve) => setTimeout(resolve, start - Date.now()))
    const url = new URL("search", base.endsWith("/") ? base : `${base}/`)
    url.searchParams.set("q", address)
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("limit", "1")
    url.searchParams.set("countrycodes", "kr")
    const response = await fetch(url, {
      // Nominatim은 애플리케이션이 자기 이름을 밝히기를 요구한다.
      headers: { "User-Agent": `uniconnect/1.0${config.siteUrl ? ` (+${config.siteUrl})` : ""}`, "Accept-Language": "ko" },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
    return response.json()
  },
}

// 매장 주소를 OpenStreetMap으로 좌표로 바꾼다(NOMINATIM_URL이 있을 때).
// 없거나, 찾지 못한 주소이거나, 서비스에 닿지 못하면 undefined다. 주소는
// 남고 거리는 없다.
export async function geocode(address: string): Promise<Point | undefined> {
  if (!config.nominatimUrl) return undefined
  try {
    const answer = await geocoder.search(address, config.nominatimUrl)
    const first = Array.isArray(answer) ? (answer[0] as { lat?: string; lon?: string } | undefined) : undefined
    const lat = Number(first?.lat)
    const lng = Number(first?.lon)
    return first?.lat && first?.lon && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined
  } catch (error) {
    console.error(`[geocode] OpenStreetMap search: ${(error as Error).message}`)
    return undefined
  }
}
