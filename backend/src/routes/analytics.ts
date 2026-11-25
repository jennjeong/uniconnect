
import { budgetView, setBudget } from "../lib/budget.js"
import { HttpError } from "../lib/errors.js"
import { isPro } from "../lib/plan.js"
import { portfolio } from "../lib/portfolio.js"
import { reportState } from "../lib/premiumReport.js"
import { finishedSponsorships } from "../lib/sponsorships.js"
import { isDemoAccount } from "../lib/reviews.js"
import { getDatabase, saveDatabase } from "../store.js"
import { brandOwner } from "./requests.js"
import { writeRouter } from "../middleware/retrying.js"

export const analyticsRouter = writeRouter()

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

// 분기별 협찬 예산과 집행(lib/budget.ts). 방문자는 데모 브랜드의 것을 본다.
// 고칠 수 있는 것은 공유 데모가 아닌 브랜드 회원뿐이다(editable).
analyticsRouter.get("/budget", (req, res) => {
  const owner = brandOwner(req)
  const database = getDatabase()
  if (!owner) throw new HttpError(403, "브랜드만 예산을 볼 수 있어요.")
  res.json({ ...budgetView(database, owner), editable: Boolean(req.account) && !isDemoAccount(database, owner) })
})

// 한 분기의 예산을 정하거나(amount) 지운다(amount: null).
analyticsRouter.put("/budget", async (req, res) => {
  const owner = req.account
  const database = getDatabase()
  if (!owner) throw new HttpError(401, "로그인이 필요해요.")
  if (owner.role !== "브랜드") throw new HttpError(403, "브랜드만 예산을 볼 수 있어요.")
  if (isDemoAccount(database, owner)) throw new HttpError(403, "데모 계정은 예산을 저장할 수 없어요.")
  // 지우기는 amount: null로만 한다. amount가 빠진 요청이 예산을 지우지 않게 한다.
  if (!req.body || typeof req.body !== "object" || !("amount" in req.body)) throw new HttpError(400, "예산은 0원부터 100억 원까지 원 단위로 적어 주세요.")
  const result = setBudget(owner, req.body.quarter, req.body.amount)
  if (result === "quarter") throw new HttpError(400, "지난 3개 분기부터 다음 2개 분기까지 정할 수 있어요.")
  if (result === "amount") throw new HttpError(400, "예산은 0원부터 100억 원까지 원 단위로 적어 주세요.")
  await saveDatabase()
  res.json({ ...budgetView(database, owner), editable: true })
})
