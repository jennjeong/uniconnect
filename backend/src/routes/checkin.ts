import { randomBytes } from "node:crypto"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { eventOf, parseKind, recordMetric } from "../lib/measurements.js"
import { text } from "../lib/validation.js"
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

// Wrong staff PINs per address and event: 4 digits must not be guessable.
const pinFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "직원 PIN을 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.",
})

// Records one QR scan, coupon or store visit for the event. A scan hands
// back a pass; the coupon needs it, once, and the visit needs it after the
// coupon, once, with the staff PIN the store was given.
checkInRouter.post("/:code/:kind", async (req, res) => {
  recordsPerClient.take(clientKey(req))
  const { measurement } = measurementFor(req.params.code)
  const kind = parseKind(req.params.kind)

  if (kind === "scans") {
    const entry = recordMetric(measurement, kind)
    const pass = randomBytes(16).toString("hex")
    measurement.passes[pass] = {}
    await saveDatabase()
    res.json({ entry, pass })
    return
  }

  const passId = text(req.body?.pass)
  if (!Object.hasOwn(measurement.passes, passId)) {
    throw new HttpError(403, "참여 기록을 찾을 수 없어요. QR을 다시 스캔해 주세요.")
  }
  const pass = measurement.passes[passId]
  if (kind === "coupons") {
    if (pass.coupon) throw new HttpError(409, "이미 쿠폰을 받았어요.")
    pass.coupon = true
  } else {
    if (!pass.coupon) throw new HttpError(409, "쿠폰을 먼저 받아 주세요.")
    if (pass.visit) throw new HttpError(409, "이미 방문이 확인됐어요.")
    const key = `${clientKey(req)} ${req.params.code}`
    pinFailures.check(key)
    if (text(req.body?.pin) !== measurement.staffPin) {
      pinFailures.hit(key)
      throw new HttpError(403, "직원 PIN이 맞지 않아요. 매장 직원에게 확인해 주세요.")
    }
    pass.visit = true
  }
  const entry = recordMetric(measurement, kind)
  await saveDatabase()
  res.json({ entry })
})
