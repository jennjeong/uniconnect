import { randomBytes } from "node:crypto"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { eventOf, parseKind, recordMetric } from "../lib/measurements.js"
import { text } from "../lib/validation.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Measurement } from "../types.js"

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

// Wrong staff PINs, per address and event and per event alone: 4 digits
// must not be guessable from one place or from many (about 80 hours for
// all 10,000 at the event cap).
const pinFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "직원 PIN을 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.",
})
const pinFailuresPerEvent = createRateLimit({
  limit: 30,
  windowMs: 15 * 60 * 1000,
  message: "이 행사의 직원 PIN이 너무 많이 틀렸어요. 15분 뒤에 다시 시도해 주세요.",
})

// Coupon numbers staff type: no 0/O or 1/I to mix up.
const couponAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function newCouponNumber(passes: Measurement["passes"]) {
  const taken = new Set(Object.values(passes).map((pass) => pass.coupon))
  let number: string
  do {
    number = `UC-${Array.from(randomBytes(6), (byte) => couponAlphabet[byte % couponAlphabet.length]).join("")}`
  } while (taken.has(number))
  return number
}

// The participant's phone: a scan hands back a pass, and the pass claims
// one coupon with a number of its own. Store visits are not recorded here.
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
  if (kind === "visits") {
    throw new HttpError(403, "매장 방문은 매장 직원 화면에서 확인해요.")
  }

  const passId = text(req.body?.pass)
  if (!Object.hasOwn(measurement.passes, passId)) {
    throw new HttpError(403, "참여 기록을 찾을 수 없어요. QR을 다시 스캔해 주세요.")
  }
  const pass = measurement.passes[passId]
  if (pass.coupon) throw new HttpError(409, "이미 쿠폰을 받았어요.")
  const coupon = newCouponNumber(measurement.passes)
  pass.coupon = coupon
  const entry = recordMetric(measurement, kind)
  await saveDatabase()
  res.json({ entry, coupon })
})

// The participant's phone asks whether the store has confirmed the visit.
checkInRouter.get("/:code/passes/:pass", (req, res) => {
  const { measurement } = measurementFor(req.params.code)
  if (!Object.hasOwn(measurement.passes, req.params.pass)) {
    throw new HttpError(404, "참여 기록을 찾을 수 없어요. QR을 다시 스캔해 주세요.")
  }
  const pass = measurement.passes[req.params.pass]
  res.json({ coupon: typeof pass.coupon === "string" ? pass.coupon : null, visited: Boolean(pass.visit) })
})

// The store staff's own device (/check-in/<code>/staff): the participant's
// coupon number and the event's staff PIN record one visit. The PIN is
// never typed on, or sent from, a participant's phone.
checkInRouter.post("/:code/staff/visits", async (req, res) => {
  recordsPerClient.take(clientKey(req))
  const { measurement } = measurementFor(req.params.code)
  const addressKey = `${clientKey(req)} ${req.params.code}`
  pinFailures.check(addressKey)
  pinFailuresPerEvent.check(req.params.code)
  if (text(req.body?.pin) !== measurement.staffPin) {
    pinFailures.hit(addressKey)
    pinFailuresPerEvent.hit(req.params.code)
    throw new HttpError(403, "직원 PIN이 맞지 않아요. 행사 주최 측에 확인해 주세요.")
  }
  const coupon = text(req.body?.coupon).toUpperCase()
  const pass = Object.values(measurement.passes).find((item) => typeof item.coupon === "string" && item.coupon === coupon)
  if (!pass) throw new HttpError(404, "쿠폰 번호를 찾을 수 없어요. 다시 확인해 주세요.")
  if (pass.visit) throw new HttpError(409, "이미 방문이 확인된 쿠폰이에요.")
  pass.visit = true
  const entry = recordMetric(measurement, "visits")
  await saveDatabase()
  res.json({ entry })
})
