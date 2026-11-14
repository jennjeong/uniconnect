import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { isDemoAccount } from "../lib/reviews.js"
import { addSearch, parseCriteria, partnersOf, searchesOf, searchView } from "../lib/savedSearches.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

// 관심 조건 저장과 새 상대 알림이다(lib/savedSearches.ts, #338). 상대 목록(학생단체에게는
// 브랜드, 브랜드에게는 단체)의 조건을 저장한다.
export const searchesRouter = Router()

searchesRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const listed = partnersOf(database, account)
  res.json({ searches: searchesOf(database, account.id).map((search) => searchView(database, account, search, listed)) })
})

// 여러 방문자가 함께 쓰는 데모 계정은 저장하지 못한다.
searchesRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 관심 조건을 저장할 수 없어요.")
  const criteria = parseCriteria(req.body, account)
  const listed = partnersOf(database, account)
  const search = addSearch(database, account, criteria, new Date(), listed)
  await saveDatabase()
  res.status(201).json({ search: searchView(database, account, search, listed) })
})

const ownSearch = (accountId: string, id: unknown) => {
  const database = getDatabase()
  const search = searchesOf(database, accountId).find((item) => item.id === id)
  if (!search) throw new HttpError(404, "관심 조건을 찾을 수 없어요.")
  return { database, search }
}

// 새 상대를 봤다고 표시한다.
searchesRouter.post("/:id/read", async (req, res) => {
  const account = requireAccount(req)
  const { database, search } = ownSearch(account.id, req.params.id)
  if (search.fresh.length) {
    search.fresh = []
    await saveDatabase()
  }
  res.json({ search: searchView(database, account, search) })
})

searchesRouter.delete("/:id", async (req, res) => {
  const account = requireAccount(req)
  const { database, search } = ownSearch(account.id, req.params.id)
  const rest = searchesOf(database, account.id).filter((item) => item !== search)
  if (rest.length) database.savedSearches![account.id] = rest
  else delete database.savedSearches![account.id]
  await saveDatabase()
  res.status(204).end()
})
