import { Router } from "express"

import { reportState } from "../lib/premiumReport.js"
import { finishedSponsorships } from "../lib/sponsorships.js"
import { getDatabase } from "../store.js"
import { brandOwner } from "./requests.js"

export const analyticsRouter = Router()

// A brand's finished sponsorships, newest first (lib/sponsorships.ts), each
// with where its detailed report stands (lib/premiumReport.ts).
analyticsRouter.get("/", (req, res) => {
  const owner = brandOwner(req)
  const database = getDatabase()
  res.json({
    sponsorships: owner
      ? finishedSponsorships(database, owner.id).map((sponsorship) => ({
          ...sponsorship,
          report: reportState(database, owner, sponsorship.id, !req.account),
        }))
      : [],
  })
})
