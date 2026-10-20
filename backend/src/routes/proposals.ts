import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

export const proposalsRouter = Router()

// Ids of the matches the logged-in account has sent a sponsorship proposal to.
proposalsRouter.get("/", (req, res) => {
  const proposals = req.account ? (getDatabase().proposals[req.account.id] ?? []) : []
  res.json({ proposals })
})

proposalsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const matchId = String(req.body?.matchId ?? "")
  const database = getDatabase()
  // Student groups can propose to any brand in the catalog, not only the top picks.
  const partners = account.role === "학생단체" ? database.brands : database.matches[account.role]
  if (!partners.some((match) => match.id === matchId)) {
    throw new HttpError(404, "목록에 없는 상대예요.")
  }

  const current = database.proposals[account.id] ?? []
  if (!current.includes(matchId)) database.proposals[account.id] = [...current, matchId]
  await saveDatabase()
  res.status(201).json({ proposals: database.proposals[account.id] })
})

proposalsRouter.delete("/:matchId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  database.proposals[account.id] = (database.proposals[account.id] ?? []).filter(
    (matchId) => matchId !== req.params.matchId,
  )
  await saveDatabase()
  res.json({ proposals: database.proposals[account.id] })
})
