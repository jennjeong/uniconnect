import { todayInKorea } from "./dates.js"
import { estimatedSales } from "./measurements.js"
import type { Database, Sponsorship } from "../types.js"

// An accepted proposal becomes one of the brand's sponsorships: the event
// it is about, linked by id when it is a student event, so its counts,
// value and goal come from that event's measurement. Once only.
export function recordSponsorship(
  database: Database,
  brandAccountId: string,
  sponsorship: Pick<Sponsorship, "id" | "groupName" | "eventName" | "date" | "eventId">,
) {
  const list = (database.sponsorships[brandAccountId] ??= [])
  if (list.some((item) => item.id === sponsorship.id)) return
  list.push({ ...sponsorship, spend: 0, coupons: 0, visits: 0, sales: 0, targetRoas: 150 })
}

// A sponsorship of a measured event with that event's live coupons, visits
// and estimated sales, and the value and ROAS goal the group set.
function withLiveFigures(database: Database, sponsorship: Sponsorship): Sponsorship {
  const measurement = database.measurements.find((item) => item.eventId === sponsorship.eventId)
  if (!measurement) return sponsorship
  const value = measurement.goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  return {
    ...sponsorship,
    spend: value || sponsorship.spend,
    coupons: measurement.metrics.coupons,
    visits: measurement.metrics.visits,
    sales: estimatedSales(measurement),
    targetRoas: measurement.goals.targets.roas,
  }
}

// How many other brands sponsor the same event. Its measurement counts the
// whole event, so their figures are the same and not split between them.
function otherSponsors(database: Database, brandAccountId: string, eventId: string) {
  return Object.entries(database.sponsorships).filter(
    ([accountId, list]) => accountId !== brandAccountId && list.some((item) => item.eventId === eventId),
  ).length
}

// The brand's sponsorships whose day has come, newest first, measured ones
// with their live figures and the number of brands they share the event with.
export function finishedSponsorships(database: Database, brandAccountId: string) {
  const today = todayInKorea()
  return (database.sponsorships[brandAccountId] ?? [])
    .filter((sponsorship) => sponsorship.date && sponsorship.date <= today)
    .map((sponsorship) => {
      const live = withLiveFigures(database, sponsorship)
      const shared = sponsorship.eventId ? otherSponsors(database, brandAccountId, sponsorship.eventId) : 0
      return shared ? { ...live, sharedWith: shared } : live
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}

// Before the measurements of these events go (their group is leaving), the
// sponsorships of them keep their figures as they stand, so the sponsors'
// history stays.
export function freezeSponsorships(database: Database, eventIds: Set<string>) {
  for (const [brandAccountId, list] of Object.entries(database.sponsorships)) {
    database.sponsorships[brandAccountId] = list.map((sponsorship) => {
      if (!sponsorship.eventId || !eventIds.has(sponsorship.eventId)) return sponsorship
      const { eventId: _, ...frozen } = withLiveFigures(database, sponsorship)
      return frozen
    })
  }
}

// Whether a sponsor depends on this event: an accepted proposal about it or
// a sponsorship recorded for it.
export function isSponsored(database: Database, eventId: string) {
  return (
    database.requests.some((request) => request.eventId === eventId && request.status === "수락") ||
    database.offers.some((offer) => offer.campaignId === eventId && offer.status === "수락") ||
    Object.values(database.sponsorships).some((list) => list.some((item) => item.eventId === eventId))
  )
}
