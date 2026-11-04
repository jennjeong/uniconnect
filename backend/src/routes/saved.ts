import { Router } from "express"

import { listedTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

export const savedRouter = Router()

// 한 계정이 저장해 둘 수 있는 리스팅의 최대 수다.
const maxSaved = 200

// 계정이 만나는 쪽의 카탈로그다. 학생단체에게는 브랜드다.
const partnerCatalog = (account: Account) => (account.role === "학생단체" ? "brands" : "groups")

// 이 계정이 목록에서 찾을 수 있는 반대편의 리스팅을 id로 찾는다.
function seenListing(database: Database, account: Account, id: string) {
  const catalog = partnerCatalog(account)
  const listing = database[catalog].find((item) => item.id === id)
  return listing && listedTo(database, catalog, listing, account) ? listing : undefined
}

// 이 계정이 저장한(찜) 리스팅 중 아직 찾을 수 있는 것을 최신순으로 보여 준다.
// 떠났거나 차단됐거나 잠시 멈춘 리스팅은 빠지고(멈춘 리스팅은 주인이 다시
// 보이게 하면 돌아온다).
savedRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  res.json({ saved: (database.saved[account.id] ?? []).filter((id) => seenListing(database, account, id)) })
})

savedRouter.put("/:listingId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const id = String(req.params.listingId)
  if (!seenListing(database, account, id)) throw new HttpError(404, "찜할 상대를 찾을 수 없어요.")
  const saved = database.saved[account.id] ?? []
  if (!saved.includes(id)) {
    if (saved.length >= maxSaved) throw new HttpError(409, "찜은 200곳까지 할 수 있어요. 찜 탭에서 몇 곳을 풀어 주세요.")
    database.saved[account.id] = [id, ...saved]
    await saveDatabase()
  }
  res.status(204).end()
})

savedRouter.delete("/:listingId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const saved = database.saved[account.id] ?? []
  const left = saved.filter((id) => id !== String(req.params.listingId))
  if (left.length !== saved.length) {
    if (left.length > 0) database.saved[account.id] = left
    else delete database.saved[account.id]
    await saveDatabase()
  }
  res.status(204).end()
})
