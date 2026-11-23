import { listedTo, partnerCatalogOf } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { isDemoAccount } from "../lib/reviews.js"
import { dismissReasons } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"
import { writeRouter } from "../middleware/retrying.js"
import { maxDismissed } from "../lib/dismissed.js"

// 관심 없음(#341): 회원이 추천에서 뺀 상대다. 뺀 상대는 추천 상위(/api/matches)와
// 주간 요약 메일에서 빠지고, 전체 목록과 검색에는 그대로 보인다. 되돌리면 다시 추천된다.
// 공용 데모 계정은 여러 방문자가 함께 쓰므로 뺄 수 없다.
export const dismissedRouter = writeRouter()

function seenListing(database: Database, account: Account, id: string) {
  const catalog = partnerCatalogOf(account.role)
  const listing = database[catalog].find((item) => item.id === id)
  return listing && listedTo(database, catalog, listing, account) ? listing : undefined
}

dismissedRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  res.json({
    dismissed: (database.dismissed?.[account.id] ?? []).flatMap((item) => {
      const listing = seenListing(database, account, item.listingId)
      return listing ? [{ ...item, name: listing.name }] : []
    }),
  })
})

dismissedRouter.put("/:listingId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "체험 계정에서는 추천을 뺄 수 없어요. 가입하면 쓸 수 있어요.")
  const id = String(req.params.listingId)
  if (!seenListing(database, account, id)) throw new HttpError(404, "추천에서 뺄 상대를 찾을 수 없어요.")
  const reason = req.body?.reason
  if (typeof reason !== "string" || !dismissReasons.includes(reason)) throw new HttpError(400, "추천에서 빼는 이유를 골라 주세요.")
  const list = (database.dismissed?.[account.id] ?? []).filter((item) => item.listingId !== id)
  if (list.length >= maxDismissed) throw new HttpError(409, "관심 없음은 200곳까지 표시할 수 있어요. 몇 곳을 되돌려 주세요.")
  database.dismissed = { ...database.dismissed, [account.id]: [{ listingId: id, reason, at: new Date().toISOString() }, ...list] }
  await saveDatabase()
  res.status(204).end()
})

dismissedRouter.delete("/:listingId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const list = database.dismissed?.[account.id] ?? []
  const left = list.filter((item) => item.listingId !== String(req.params.listingId))
  if (left.length !== list.length && database.dismissed) {
    if (left.length > 0) database.dismissed[account.id] = left
    else delete database.dismissed[account.id]
    await saveDatabase()
  }
  res.status(204).end()
})
