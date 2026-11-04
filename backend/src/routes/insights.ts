import { randomBytes } from "node:crypto"
import { Router } from "express"

import { paidFor, prices } from "../lib/billing.js"
import { HttpError } from "../lib/errors.js"
import { canReadReport, premiumReport, reportOpen, sponsorshipFor } from "../lib/premiumReport.js"
import { isDemoAccount } from "../lib/reviews.js"
import { getDatabase, saveDatabase } from "../store.js"
import { brandOwner } from "./requests.js"

// 상세 성과 리포트(lib/premiumReport.ts)다. 브랜드가 산 자기 리포트(데모
// 브랜드의 리포트는 방문자가 볼 수 있게 열려 있다)나 담긴 내용의 미리보기,
// 공유용 읽기 전용 링크, 리포트가 비교하는 매장 자체의 집계를 다룬다.
export const insightsRouter = Router()


function owned(req: Parameters<typeof brandOwner>[0], id: string) {
  const account = brandOwner(req)
  const database = getDatabase()
  const found = account && sponsorshipFor(database, account, id)
  if (!account || !found) throw new HttpError(404, "측정한 협찬을 찾을 수 없어요.")
  return { account, database, ...found }
}

insightsRouter.get("/:id", async (req, res) => {
  const { account, database, sponsorship, event } = owned(req, String(req.params.id))
  if (!canReadReport(database, account, sponsorship.id, !req.account)) {
    res.json({
      locked: true,
      price: prices.report,
      open: reportOpen(event),
      sponsorship: { id: sponsorship.id, groupName: sponsorship.groupName, eventName: event.name, date: event.date },
    })
    return
  }
  // 산 리포트를 처음 열어 본 뒤에는 환불하지 않는다. 약관이 그 전까지만 환불해 준다.
  const bought = req.account ? paidFor(database, account.id, "report", sponsorship.id) : undefined
  if (bought && !bought.openedAt) {
    bought.openedAt = new Date().toISOString()
    await saveDatabase()
  }
  res.json({
    locked: false,
    report: premiumReport(database, account, sponsorship.id),
    // 회원은 자기 매장의 집계와 점유를 추가할 수 있고, 데모는 읽기만 한다.
    editable: Boolean(req.account) && !isDemoAccount(database, account),
    shared: Boolean(sponsorship.shareToken),
    ...(sponsorship.shareToken ? { shareToken: sponsorship.shareToken } : {}),
  })
})

// 행사 전과 행사 중 매장의 일별 방문자 수로, 평소 날과 비교해 효과를 본다.
// 회원만 쓸 수 있고, 읽을 권한이 있는 리포트에 한한다.
insightsRouter.put("/:id/lift", async (req, res) => {
  const { account, database, sponsorship } = owned(req, String(req.params.id))
  if (!req.account || isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 매장 방문 수를 적을 수 없어요.")
  if (!canReadReport(database, account, sponsorship.id, !req.account)) throw new HttpError(402, "상세 리포트를 산 뒤에 적을 수 있어요.")
  const count = (value: unknown) => {
    const number = Number(value)
    if (!Number.isFinite(number) || number < 0 || number > 100_000) throw new HttpError(400, "하루 방문객 수는 0부터 100,000까지의 숫자로 적어 주세요.")
    return Math.round(number * 10) / 10
  }
  const before = count(req.body?.before)
  const during = count(req.body?.during)
  if (before === 0) throw new HttpError(400, "협찬 전 하루 방문객 수를 1 이상으로 적어 주세요.")
  sponsorship.lift = { before, during, updatedAt: new Date().toISOString() }
  await saveDatabase()
  res.json({ report: premiumReport(database, account, sponsorship.id) })
})

// 링크를 가진 누구나(예: 학생단체나 담당자) 열 수 있는 읽기 전용 링크다.
// 끄면 기존 링크는 쓸 수 없게 된다.
insightsRouter.post("/:id/share", async (req, res) => {
  const { account, database, sponsorship } = owned(req, String(req.params.id))
  if (!req.account || isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 리포트를 공유할 수 없어요.")
  if (!canReadReport(database, account, sponsorship.id, !req.account)) throw new HttpError(402, "상세 리포트를 산 뒤에 공유할 수 있어요.")
  sponsorship.shareToken ??= randomBytes(18).toString("base64url")
  await saveDatabase()
  res.json({ shareToken: sponsorship.shareToken })
})

insightsRouter.delete("/:id/share", async (req, res) => {
  const { sponsorship } = owned(req, String(req.params.id))
  if (!req.account) throw new HttpError(403, "데모 계정은 리포트를 공유할 수 없어요.")
  delete sponsorship.shareToken
  await saveDatabase()
  res.status(204).end()
})

// 링크를 가진 누구에게나 링크로 공유 리포트를 보여 준다.
insightsRouter.get("/shared/:token", (req, res) => {
  const database = getDatabase()
  const token = String(req.params.token)
  for (const [accountId, list] of Object.entries(database.sponsorships)) {
    const sponsorship = list.find((item) => item.shareToken && item.shareToken === token)
    const account = sponsorship && database.accounts.find((item) => item.id === accountId)
    // 정지된 브랜드의 링크는 장부와 캘린더 링크처럼 멈춘다.
    if (sponsorship && account && !account.suspendedAt) {
      res.json({ report: premiumReport(database, account, sponsorship.id) })
      return
    }
  }
  throw new HttpError(404, "공유가 끝났거나 없는 리포트예요.")
})
