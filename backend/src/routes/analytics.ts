import { Router } from "express"

import { isPro } from "../lib/plan.js"
import { portfolio } from "../lib/portfolio.js"
import { reportState } from "../lib/premiumReport.js"
import { finishedSponsorships } from "../lib/sponsorships.js"
import { getDatabase } from "../store.js"
import { brandOwner } from "./requests.js"

export const analyticsRouter = Router()

// 브랜드의 끝난 협찬을 최신순으로 보여 주며(lib/sponsorships.ts), 각 협찬의
// 상세 리포트가 어디까지 왔는지도 함께 담는다(lib/premiumReport.ts).
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

// 캠퍼스 포트폴리오(lib/portfolio.ts)다. Growth 브랜드는 자기 것을,
// 방문자는 예시로 데모 브랜드의 것을 보고, 나머지는 잠긴 모습을 본다.
analyticsRouter.get("/portfolio", (req, res) => {
  const owner = brandOwner(req)
  const database = getDatabase()
  if (!owner || (req.account && !isPro(database, owner.id))) {
    res.json({ locked: true })
    return
  }
  res.json({ locked: false, portfolio: portfolio(database, owner) })
})
