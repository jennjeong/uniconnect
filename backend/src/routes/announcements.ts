import { Router } from "express"

import { liveAnnouncements } from "../lib/adminTools.js"
import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { getDatabase, saveDatabase } from "../store.js"

export const announcementsRouter = Router()

// 이 보는 사람에게 보이는 운영자 공지로, 사이트 맨 위에 띄운다.
announcementsRouter.get("/", (req, res) => {
  res.json({ announcements: liveAnnouncements(getDatabase(), req.account) })
})

const dismissals = createRateLimit({
  limit: 30,
  windowMs: 15 * 60 * 1000,
  message: "요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.",
})

// 방문자가 공지를 닫으면 누가 닫았는지는 빼고 콘솔용으로 세기만 한다.
announcementsRouter.post("/:id/dismiss", async (req, res) => {
  await dismissals.take(clientKey(req))
  const item = getDatabase().announcements?.find((entry) => entry.id === req.params.id)
  if (!item) throw new HttpError(404, "공지를 찾을 수 없어요.")
  item.dismissals = (item.dismissals ?? 0) + 1
  await saveDatabase()
  res.status(204).end()
})
