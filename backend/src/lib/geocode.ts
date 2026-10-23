import { config } from "../config.js"
import type { Point } from "./geo.js"

// OpenStreetMap's public Nominatim takes at most one request a second from
// each application, so lookups wait their turn.
const spacingMs = 1100
let nextAt = 0

// The request to an OpenStreetMap Nominatim search (NOMINATIM_URL), kept
// apart so tests can answer it themselves. Its answers may be kept (ODbL,
// with "© OpenStreetMap contributors" shown in the footer), unlike Kakao's or
// VWorld's geocoders, which allow only live use.
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
      // Nominatim asks each application to name itself.
      headers: { "User-Agent": `uniconnect/1.0${config.siteUrl ? ` (+${config.siteUrl})` : ""}`, "Accept-Language": "ko" },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
    return response.json()
  },
}

// A store address as coordinates, through OpenStreetMap once NOMINATIM_URL is
// set. Undefined without it, for an address it can't find, or when the
// service can't be reached: the address is kept and has no distance.
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
