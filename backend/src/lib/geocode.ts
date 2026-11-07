import { config } from "../config.js"
import type { Point } from "./geo.js"

// OpenStreetMap의 공개 Nominatim은 애플리케이션마다 초당 한 건만 받으므로
// 조회는 차례를 기다린다.
const spacingMs = 1100
// 이보다 오래 기다려야 하면 조회하지 않는다. 주소를 계속 바꿔 대기열을 늘려도 다른 회원의
// 저장이 함수 제한 시간을 넘기지 않게 한다. 주소는 위치 없이 저장된다.
const maxWaitMs = 3000
let nextAt = 0

// 조회 차례를 잡고 기다릴 시간을 답한다. 너무 오래 기다려야 하면 차례를 잡지 않는다.
export function takeTurn(now = Date.now()) {
  const start = Math.max(now, nextAt)
  if (start - now > maxWaitMs) return undefined
  nextAt = start + spacingMs
  return start - now
}

// OpenStreetMap Nominatim 검색(NOMINATIM_URL)에 보내는 요청. 테스트가 스스로
// 답할 수 있게 따로 둔다. Kakao나 VWorld의 지오코더는 실시간 사용만 허용
// 하지만 이쪽의 답은 보관해도 된다(ODbL, 푸터에 "© OpenStreetMap
// contributors"를 표시).
export const geocoder = {
  async search(address: string, base: string): Promise<unknown> {
    const wait = takeTurn()
    if (wait === undefined) return []
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
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
