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

// The brand's sponsorships whose day has come, newest first. One of a
// measured event follows its live coupons, visits and estimated sales, and
// takes its value and ROAS goal from the goals the group set.
export function finishedSponsorships(database: Database, brandAccountId: string) {
  const today = todayInKorea()
  return (database.sponsorships[brandAccountId] ?? [])
    .filter((sponsorship) => sponsorship.date && sponsorship.date <= today)
    .map((sponsorship) => {
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
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}
