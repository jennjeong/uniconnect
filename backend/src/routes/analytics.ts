import { Router } from "express"

import { estimatedSales } from "../lib/measurements.js"
import { getDatabase } from "../store.js"
import { brandOwner } from "./requests.js"

export const analyticsRouter = Router()

// A brand's finished sponsorships, newest first. A sponsorship of a measured
// event follows that event's live coupons, visits and estimated sales.
analyticsRouter.get("/", (req, res) => {
  const database = getDatabase()
  const owner = brandOwner(req)
  const sponsorships = (owner ? (database.sponsorships[owner.id] ?? []) : [])
    .map((sponsorship) => {
      const measurement = database.measurements.find((item) => item.eventId === sponsorship.eventId)
      return measurement
        ? {
            ...sponsorship,
            coupons: measurement.metrics.coupons,
            visits: measurement.metrics.visits,
            sales: estimatedSales(measurement),
          }
        : sponsorship
    })
    .sort((a, b) => b.date.localeCompare(a.date))
  res.json({ sponsorships })
})
