import { randomBytes } from "node:crypto"
import { Router } from "express"

import { paidFor, prices } from "../lib/billing.js"
import { HttpError } from "../lib/errors.js"
import { premiumReport, reportOpen, sponsorshipFor } from "../lib/premiumReport.js"
import { isDemoAccount } from "../lib/reviews.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"
import { brandOwner } from "./requests.js"

// 상세 성과 리포트 (lib/premiumReport.ts): a brand's own, once bought (the
// demo brand's are open, for visitors to see one), or a preview of what it
// holds; a read-only link to share it; and the store's own counts the
// report compares.
export const insightsRouter = Router()

// Whether the account may read the report: bought it, or is the demo brand.
// (Pro includes every report: lib/pro.ts adds itself here.)
export const reportAccess: ((database: Database, account: Account, sponsorshipId: string) => boolean)[] = [
  (database, account) => isDemoAccount(database, account),
  (database, account, id) => Boolean(paidFor(database, account.id, "report", id)),
]

const unlocked = (database: Database, account: Account, id: string) => reportAccess.some((allows) => allows(database, account, id))

function owned(req: Parameters<typeof brandOwner>[0], id: string) {
  const account = brandOwner(req)
  const database = getDatabase()
  const found = account && sponsorshipFor(database, account, id)
  if (!account || !found) throw new HttpError(404, "측정한 협찬을 찾을 수 없어요.")
  return { account, database, ...found }
}

insightsRouter.get("/:id", async (req, res) => {
  const { account, database, sponsorship, event } = owned(req, String(req.params.id))
  if (!unlocked(database, account, sponsorship.id)) {
    res.json({
      locked: true,
      price: prices.report,
      open: reportOpen(event),
      sponsorship: { id: sponsorship.id, groupName: sponsorship.groupName, eventName: event.name, date: event.date },
    })
    return
  }
  // The first look at a bought report is kept: the terms refund it only before.
  const bought = req.account ? paidFor(database, account.id, "report", sponsorship.id) : undefined
  if (bought && !bought.openedAt) {
    bought.openedAt = new Date().toISOString()
    await saveDatabase()
  }
  res.json({
    locked: false,
    report: premiumReport(database, account, sponsorship.id),
    // A member may add its store's counts and share; the demo only reads.
    editable: Boolean(req.account) && !isDemoAccount(database, account),
    shared: Boolean(sponsorship.shareToken),
    ...(sponsorship.shareToken ? { shareToken: sponsorship.shareToken } : {}),
  })
})

// The store's daily visitors before and during, for the effect over the
// usual days; members only, on a report they may read.
insightsRouter.put("/:id/lift", async (req, res) => {
  const { account, database, sponsorship } = owned(req, String(req.params.id))
  if (!req.account || isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 매장 방문 수를 적을 수 없어요.")
  if (!unlocked(database, account, sponsorship.id)) throw new HttpError(402, "상세 리포트를 산 뒤에 적을 수 있어요.")
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

// A read-only link anyone with it can open, such as the student group or a
// manager; turned off, the old link stops working.
insightsRouter.post("/:id/share", async (req, res) => {
  const { account, database, sponsorship } = owned(req, String(req.params.id))
  if (!req.account || isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 리포트를 공유할 수 없어요.")
  if (!unlocked(database, account, sponsorship.id)) throw new HttpError(402, "상세 리포트를 산 뒤에 공유할 수 있어요.")
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

// The shared report, by its link, for anyone holding it.
insightsRouter.get("/shared/:token", (req, res) => {
  const database = getDatabase()
  const token = String(req.params.token)
  for (const [accountId, list] of Object.entries(database.sponsorships)) {
    const sponsorship = list.find((item) => item.shareToken && item.shareToken === token)
    const account = sponsorship && database.accounts.find((item) => item.id === accountId)
    if (sponsorship && account) {
      res.json({ report: premiumReport(database, account, sponsorship.id) })
      return
    }
  }
  throw new HttpError(404, "공유가 끝났거나 없는 리포트예요.")
})
