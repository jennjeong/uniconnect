import { randomUUID } from "node:crypto"
import { Router } from "express"

import { toIsoDate } from "../lib/dates.js"
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
  const rawDate = text(req.body?.date)
  const people = text(req.body?.people)
  const types: string[] = Array.isArray(req.body?.types)
    ? sponsorTypes.filter((type) => req.body.types.map(String).includes(type))
    : []
  // Free text describing the "기타" type.
  const typeNote = text(req.body?.typeNote)

  if (!name || !rawDate) {
    const label = account.role === "학생단체" ? "행사명" : "캠페인명"
    throw new HttpError(400, `${label}과 일정을 입력해 주세요.`)
  }
  const date = toIsoDate(rawDate)
  if (!date) throw new HttpError(400, "일정은 달력에서 날짜를 골라 주세요.")
  if (types.length === 0) throw new HttpError(400, "원하는 협찬 유형을 하나 이상 골라 주세요.")
  if (types.includes("기타") && !typeNote) {
    throw new HttpError(400, "기타 협찬 유형을 적어 주세요.")
  }
  if (typeNote.length > 30) throw new HttpError(400, "기타 협찬 유형은 30자 이하로 적어 주세요.")

  const event: EventItem = {
    id: randomUUID(),
    name,
    date,
    people,
    types,
    ...(types.includes("기타") ? { typeNote } : {}),
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
