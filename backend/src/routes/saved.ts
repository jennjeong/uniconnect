import { Router } from "express"

import { listedTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

export const savedRouter = Router()

// Most listings one account keeps saved.
const maxSaved = 200

// The catalog of the side an account meets: brands for student groups.
const partnerCatalog = (account: Account) => (account.role === "학생단체" ? "brands" : "groups")

// A listing of the other side this account finds in the lists, by id.
function seenListing(database: Database, account: Account, id: string) {
  const catalog = partnerCatalog(account)
  const listing = database[catalog].find((item) => item.id === id)
  return listing && listedTo(database, catalog, listing, account) ? listing : undefined
}

// The listings this account saved (찜) that it still finds, newest first: one
// that left, was blocked or is paused for now drops out (and a paused one
// comes back once its owner shows it again).
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
