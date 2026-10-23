import { campuses, type Campus } from "../data/campuses.js"
import type { Account, Match } from "../types.js"

export type Point = { lat: number; lng: number }

// Straight-line distance in km between two points (haversine), to 0.1 km.
export function distanceKm(a: Point, b: Point) {
  const rad = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10
}

// A school's campus: by the email domain it verified with (or a subdomain of
// it), else by the school's name. Undefined for schools not in the table.
export function campusOf({ email, school }: { email?: string; school?: string }): Campus | undefined {
  const domain = email?.split("@")[1]?.toLowerCase()
  const byDomain =
    domain && campuses.find((campus) => campus.domains.some((item) => domain === item || domain.endsWith(`.${item}`)))
  return byDomain || campuses.find((campus) => campus.name === school?.trim())
}

// Where a listing (or an account without one) is: a brand's store, or a
// student group's campus, by its account's email when it has one, else by
// the school it lists.
export function placeOf(listing: Pick<Match, "location" | "school"> | undefined, account?: Account): Point | undefined {
  const location = listing?.location
  if (location?.lat !== undefined && location.lng !== undefined) return { lat: location.lat, lng: location.lng }
  if (listing?.school !== undefined || account?.role === "학생단체") {
    return campusOf({ email: account?.email, school: listing?.school ?? account?.school })
  }
  return undefined
}
