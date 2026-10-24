import type { Match } from "../types"

// "800m" under a kilometre, else "3.5km" ("12km" when whole).
export function formatDistance(km: number) {
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m`
  return `${Number.isInteger(km) ? km : km.toFixed(1)}km`
}

// A listing's tags to show: once the real distance shows beside them, a
// tag giving a radius of its own ("반경 1.2km") would contradict it.
export function shownTags(listing: Pick<Match, "tags" | "distanceKm">) {
  if (listing.distanceKm === undefined) return listing.tags
  return listing.tags.filter((tag) => !/^반경\s*\d/.test(tag))
}

// Listings nearest first; those with no distance (online brands, schools
// not on the map) keep their order after them.
export function nearestFirst<T extends Pick<Match, "distanceKm">>(listings: T[]) {
  const placed = listings.filter((listing) => listing.distanceKm !== undefined)
  const unplaced = listings.filter((listing) => listing.distanceKm === undefined)
  return [...placed.sort((a, b) => a.distanceKm! - b.distanceKm!), ...unplaced]
}
