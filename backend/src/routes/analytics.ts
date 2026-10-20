import { Router } from "express"

import { getDatabase } from "../store.js"
import { brandOwner } from "./requests.js"

export const analyticsRouter = Router()

// A brand's finished sponsorships, newest first. The measured event follows
// the live QR, coupon and visit counts.
analyticsRouter.get("/", (req, res) => {
  const database = getDatabase()
  const owner = brandOwner(req)
  const sponsorships = (owner ? (database.sponsorships[owner.id] ?? []) : [])
    .map((sponsorship) =>
      sponsorship.eventName === database.report.eventName
        ? { ...sponsorship, coupons: database.metrics.coupons, visits: database.metrics.visits }
        : sponsorship,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  res.json({ sponsorships })
})
