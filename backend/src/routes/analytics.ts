import { Router } from "express"

import { finishedSponsorships } from "../lib/sponsorships.js"
import { getDatabase } from "../store.js"
import { brandOwner } from "./requests.js"

export const analyticsRouter = Router()

// A brand's finished sponsorships, newest first (lib/sponsorships.ts).
analyticsRouter.get("/", (req, res) => {
  const owner = brandOwner(req)
  res.json({ sponsorships: owner ? finishedSponsorships(getDatabase(), owner.id) : [] })
})
