import { randomUUID } from "node:crypto"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { parseRole, sponsorTypes, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { EventItem } from "../types.js"

export const eventsRouter = Router()

// Visitors see the demo account's events for the role they are previewing.
eventsRouter.get("/", (req, res) => {
  const database = getDatabase()
  const ownerId = req.account?.id ?? database.demoAccountIds[parseRole(req.query.role)]
  res.json({ events: database.events[ownerId] ?? [] })
})

eventsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const name = text(req.body?.name)
  const date = text(req.body?.date)
  const people = text(req.body?.people)
  const types: string[] = Array.isArray(req.body?.types)
    ? req.body.types.filter((type: unknown) => sponsorTypes.includes(String(type)))
    : []

  if (!name || !date) {
    const label = account.role === "학생단체" ? "행사명" : "캠페인명"
    throw new HttpError(400, `${label}과 일정을 입력해 주세요.`)
  }

  const event: EventItem = {
    id: randomUUID(),
    name,
    date,
    people,
    types,
    status: "매칭 중",
    createdAt: new Date().toISOString(),
  }
  const database = getDatabase()
  database.events[account.id] = [event, ...(database.events[account.id] ?? [])]
  await saveDatabase()
  res.status(201).json({ event })
})

eventsRouter.delete("/:id", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const events = database.events[account.id] ?? []
  if (!events.some((event) => event.id === req.params.id)) {
    throw new HttpError(404, "행사를 찾을 수 없어요.")
  }
  database.events[account.id] = events.filter((event) => event.id !== req.params.id)
  await saveDatabase()
  res.status(204).end()
})
