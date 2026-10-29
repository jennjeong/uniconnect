import { Router } from "express"

import { isPro } from "../lib/plan.js"
import { portfolio } from "../lib/portfolio.js"
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

// 캠퍼스 포트폴리오 (lib/portfolio.ts): a Campus Partners brand's, or the
// demo brand's for visitors to see one; others see it locked.
analyticsRouter.get("/portfolio", (req, res) => {
  const owner = brandOwner(req)
  const database = getDatabase()
  if (!owner || (req.account && !isPro(database, owner.id))) {
    res.json({ locked: true })
    return
  }
  res.json({ locked: false, portfolio: portfolio(database, owner) })
})
