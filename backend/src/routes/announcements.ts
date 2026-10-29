import { Router } from "express"

import { liveAnnouncements } from "../lib/adminTools.js"
import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { getDatabase, saveDatabase } from "../store.js"

export const announcementsRouter = Router()

// The operators' notices this viewer sees, shown across the top of the site.
announcementsRouter.get("/", (req, res) => {
  res.json({ announcements: liveAnnouncements(getDatabase(), req.account) })
})

const dismissals = createRateLimit({
  limit: 30,
  windowMs: 15 * 60 * 1000,
  message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
})

// A visitor closed a notice: counted, for the console, without who.
announcementsRouter.post("/:id/dismiss", async (req, res) => {
  await dismissals.take(clientKey(req))
  const item = getDatabase().announcements?.find((entry) => entry.id === req.params.id)
  if (!item) throw new HttpError(404, "공지를 찾을 수 없어요.")
  item.dismissals = (item.dismissals ?? 0) + 1
  await saveDatabase()
  res.status(204).end()
})
