import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { eventOf, parseKind, recordMetric } from "../lib/measurements.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { getDatabase, saveDatabase } from "../store.js"

// The page participants reach by scanning an event's QR. It needs no login,
// so the event is found by the code in its address alone.
export const checkInRouter = Router()

function measurementFor(code: string) {
  const database = getDatabase()
  const measurement = database.measurements.find((item) => item.code === code)
  const event = measurement && eventOf(database, measurement)
  if (!measurement || !event) throw new HttpError(404, "행사를 찾을 수 없어요. QR을 다시 스캔해 주세요.")
  return { measurement, event }
}

// What the participant sees: the event, the group and the sponsor's coupon.
checkInRouter.get("/:code", (req, res) => {
  const { measurement, event } = measurementFor(req.params.code)
  const group = getDatabase().accounts.find((account) => account.id === measurement.accountId)
  res.json({
    eventName: event.name,
    eventDate: event.date,
    groupName: group?.name ?? "",
    coupon: measurement.goals.coupon,
  })
})

// Each address may record only so many a minute; a busy booth on one
// Wi-Fi stays well under it.
const recordsPerClient = createRateLimit({
  limit: 120,
  windowMs: 60 * 1000,
  message: "기록 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// Records one QR scan, coupon or store visit for the event.
checkInRouter.post("/:code/:kind", async (req, res) => {
  recordsPerClient.take(clientKey(req))
  const { measurement } = measurementFor(req.params.code)
  const entry = recordMetric(measurement, parseKind(req.params.kind))
  await saveDatabase()
  res.json({ entry })
})
