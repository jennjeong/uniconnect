import { createHash, randomBytes } from "node:crypto"
import { Router } from "express"

import type { Request } from "express"

import { todayInKorea } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { assertOpen, checkInKinds, eventOf, isDemoEvent, parseKind, passLimit, recordMetric, scanCeiling } from "../lib/measurements.js"
import {
  activeMethodsOf,
  confirmsAt,
  isVenueKind,
  methodKinds,
  parseAmount,
  usesMethod,
  venueCountsOf,
  venueMetrics,
} from "../lib/methods.js"
import { surveyOptions, text } from "../lib/validation.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { ChatSide, EventSponsor, Measurement, PassCoupon } from "../types.js"

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

// The coupons participants can take: one per sponsor once brands sponsor
// the event (by the sponsorship's id), else the event's own ("event"); only
// those whose confirmed methods include the coupon (lib/methods.ts).
const eventCoupon = "event"

function couponsOf(measurement: Measurement) {
  if (measurement.sponsors.length) {
    return measurement.sponsors
      .filter((sponsor) => usesMethod(activeMethodsOf(measurement, sponsor), "coupon"))
      .map((sponsor) => ({ id: sponsor.id, ...sponsor.coupon }))
  }
  return usesMethod(activeMethodsOf(measurement), "coupon") ? [{ id: eventCoupon, ...measurement.goals.coupon }] : []
}

// A pass's coupon by its id: the event's on the pass itself, a sponsor's
// under its id.
function passCoupon(pass: Measurement["passes"][string], id: string): PassCoupon | undefined {
  return id === eventCoupon ? pass : pass.sponsors?.[id]
}

// What the participant sees: the event, the group and the coupons.
checkInRouter.get("/:code", (req, res) => {
  const { measurement, event } = measurementFor(req.params.code)
  const group = getDatabase().accounts.find((account) => account.id === measurement.accountId)
  res.json({
    eventName: event.name,
    eventDate: event.date,
    groupName: group?.name ?? "",
    coupons: couponsOf(measurement),
  })
})

// Each address may record only so many a minute; a busy booth on one
// Wi-Fi stays well under it.
const recordsPerClient = createRateLimit({
  limit: 120,
  windowMs: 60 * 1000,
  message: "기록 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// One phone counts once (the page keeps its pass), so scans of one event from
// the same address and browser can't run up: people sharing a campus Wi-Fi
// on different phones stay well under it.
const scansPerDevice = createRateLimit({
  limit: 20,
  windowMs: 10 * 60 * 1000,
  message: "같은 기기에서 QR을 너무 많이 스캔했어요. 참여는 한 번만 기록돼요.",
})

const deviceKey = (req: Request, code: string) =>
  createHash("sha256").update(`${clientKey(req)} ${req.get("user-agent") ?? ""} ${code}`).digest("hex")

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
  const taken = new Set(
    Object.values(passes).flatMap((pass) => [pass.coupon, ...Object.values(pass.sponsors ?? {}).map((item) => item.coupon)]),
  )
  let number: string
  do {
    number = `UC-${Array.from(randomBytes(6), (byte) => couponAlphabet[byte % couponAlphabet.length]).join("")}`
  } while (taken.has(number))
  return number
}

// The participant's optional three questions, once a pass: only the counts
// for the event are kept, and the pass remembers it answered.
checkInRouter.post("/:code/survey", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  const { measurement } = measurementFor(req.params.code)
  const passId = text(req.body?.pass)
  if (!Object.hasOwn(measurement.passes, passId)) {
    throw new HttpError(403, "참여 기록을 찾을 수 없어요. QR을 다시 스캔해 주세요.")
  }
  const pass = measurement.passes[passId]
  if (pass.surveyed) throw new HttpError(409, "이미 설문에 답했어요.")
  const pick = (key: keyof typeof surveyOptions) => {
    const value = text(req.body?.[key])
    return (surveyOptions[key] as readonly string[]).includes(value) ? value : undefined
  }
  const keys = Object.keys(surveyOptions) as (keyof typeof surveyOptions)[]
  const answers = Object.fromEntries(keys.map((key) => [key, pick(key)])) as Partial<Record<keyof typeof surveyOptions, string>>
  if (!keys.some((key) => answers[key])) throw new HttpError(400, "답을 하나 이상 골라 주세요.")
  const survey = (measurement.survey ??= { responses: 0, grade: {}, field: {}, visited: {} })
  survey.responses += 1
  for (const key of keys) {
    const value = answers[key]
    if (!value) continue
    const counts = (survey[key] ??= {})
    counts[value] = (counts[value] ?? 0) + 1
  }
  pass.surveyed = true
  await saveDatabase()
  res.status(201).json({ ok: true })
})

// The participant's phone: a scan hands back a pass, and the pass claims
// each coupon once (`couponId`, which may be left out while there is only
// one), each with a number of its own. Store visits are not recorded here.
checkInRouter.post("/:code/:kind", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  const { measurement, event } = measurementFor(req.params.code)
  const kind = parseKind(req.params.kind, checkInKinds)
  if (kind !== "visits") assertOpen(getDatabase(), measurement, event, kind)

  if (kind === "scans") {
    // The demo accounts' events are open for visitors to try.
    if (!isDemoEvent(getDatabase(), measurement)) await scansPerDevice.take(deviceKey(req, req.params.code))
    if (Object.keys(measurement.passes).length >= passLimit) {
      throw new HttpError(409, "이 행사의 참여 기록이 가득 찼어요. 행사 주최 측에 알려 주세요.")
    }
    if (measurement.metrics.scans >= scanCeiling(getDatabase(), measurement)) {
      throw new HttpError(409, "이 행사의 참여 수가 예상 인원의 3배를 넘어 더 기록하지 않아요. 행사 주최 측에 알려 주세요.")
    }
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
  const offered = couponsOf(measurement)
  const couponId = text(req.body?.couponId) || (offered.length === 1 ? offered[0].id : "")
  if (!offered.some((item) => item.id === couponId)) {
    throw new HttpError(404, "쿠폰을 찾을 수 없어요. 화면을 새로 고쳐 주세요.")
  }
  const sponsor = measurement.sponsors.find((item) => item.id === couponId)
  if (passCoupon(pass, couponId)?.coupon) throw new HttpError(409, "이미 쿠폰을 받았어요.")
  const coupon = newCouponNumber(measurement.passes)
  if (sponsor) pass.sponsors = { ...pass.sponsors, [sponsor.id]: { coupon } }
  else pass.coupon = coupon
  const entry = recordMetric(measurement, kind, sponsor)
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
  const coupons = Object.fromEntries(
    couponsOf(measurement).map(({ id }) => {
      const taken = passCoupon(pass, id)
      return [id, { number: typeof taken?.coupon === "string" ? taken.coupon : null, visited: Boolean(taken?.visit) }]
    }),
  )
  res.json({ coupons })
})

// The store staff's own device (/check-in/<code>/staff): the participant's
// coupon number and the staff PIN record one visit. Once brands sponsor the
// event each store has its own PIN, which confirms only its own coupons.
// The PIN is never typed on, or sent from, a participant's phone.
checkInRouter.post("/:code/staff/visits", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  const { measurement, event } = measurementFor(req.params.code)
  assertOpen(getDatabase(), measurement, event, "visits")
  const sponsor = await staffShare(req, measurement)
  if (!usesMethod(activeMethodsOf(measurement, sponsor), "visit")) {
    throw new HttpError(409, "이 협찬은 매장 방문을 확인하지 않아요.")
  }
  const couponId = sponsor?.id ?? eventCoupon
  const number = text(req.body?.coupon).toUpperCase()
  const taken = number
    ? Object.values(measurement.passes)
        .map((pass) => passCoupon(pass, couponId))
        .find((item) => item?.coupon === number)
    : undefined
  if (!taken) {
    const elsewhere =
      number &&
      Object.values(measurement.passes).some((pass) =>
        [pass.coupon, ...Object.values(pass.sponsors ?? {}).map((item) => item.coupon)].includes(number),
      )
    throw new HttpError(
      404,
      elsewhere ? "다른 매장의 쿠폰이에요. 쿠폰에 적힌 매장을 확인해 주세요." : "쿠폰 번호를 찾을 수 없어요. 다시 확인해 주세요.",
    )
  }
  if (taken.visit) throw new HttpError(409, "이미 방문이 확인된 쿠폰이에요.")
  taken.visit = true
  const entry = recordMetric(measurement, "visits", sponsor)
  await saveDatabase()
  res.json({ entry, store: (sponsor?.coupon ?? measurement.goals.coupon).store })
})

// A wrong PIN counts against the address (for this event) and the event,
// and toward today's count the operators' alerts read.
async function refusePin(req: Request, message: string): Promise<never> {
  const addressKey = `${clientKey(req)} ${req.params.code}`
  await pinFailures.hit(addressKey)
  await pinFailuresPerEvent.hit(String(req.params.code))
  const measurement = getDatabase().measurements.find((item) => item.code === req.params.code)
  if (measurement) {
    const today = todayInKorea()
    measurement.pinMisses = { day: today, count: measurement.pinMisses?.day === today ? measurement.pinMisses.count + 1 : 1 }
    // Only a note: a failed save doesn't change the answer.
    await saveDatabase().catch(() => undefined)
  }
  throw new HttpError(403, message)
}

async function checkPinLimits(req: Request) {
  await pinFailures.check(`${clientKey(req)} ${req.params.code}`)
  await pinFailuresPerEvent.check(String(req.params.code))
}

// The brand's page (/staff) opens the share whose store PIN it is given: a
// sponsor's, or the event's own while it has no sponsors.
async function staffShare(req: Request, measurement: Measurement): Promise<EventSponsor | undefined> {
  await checkPinLimits(req)
  const pin = text(req.body?.pin)
  const sponsor = measurement.sponsors.find((item) => item.staffPin === pin)
  if (measurement.sponsors.length ? !sponsor : pin !== measurement.staffPin) {
    await refusePin(req, "직원 PIN이 맞지 않아요. 행사 주최 측에 확인해 주세요.")
  }
  return sponsor
}

// The student group's page (/group) takes the group's own PIN, and opens
// every share of the event.
async function checkGroupPin(req: Request, measurement: Measurement) {
  await checkPinLimits(req)
  if (text(req.body?.pin) !== measurement.groupPin) {
    await refusePin(req, "단체 확인 PIN이 맞지 않아요. 임시 전자 계약서에서 확인해 주세요.")
  }
}

// One share as a venue page shows it: whose it is, the confirmed methods
// this side confirms there (alone or with the other side), and the counts
// so far.
function venueShare(measurement: Measurement, sponsor: EventSponsor | undefined, side: ChatSide) {
  const counts = sponsor?.metrics ?? measurement.metrics
  return {
    id: sponsor?.id ?? eventCoupon,
    brandName: sponsor?.brandName ?? null,
    store: (sponsor?.coupon ?? measurement.goals.coupon).store,
    kinds: activeMethodsOf(measurement, sponsor)
      .filter((method) => confirmsAt(method, side))
      .map((method) => method.kind),
    counts: { coupons: counts.coupons, visits: counts.visits, ...venueCountsOf(counts) },
  }
}

// What a venue page shows once its PIN is right, with the event: the
// brand's page its own share, the group's page every share.
checkInRouter.post("/:code/staff/session", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  const { measurement, event } = measurementFor(req.params.code)
  const sponsor = await staffShare(req, measurement)
  res.json({ eventName: event.name, eventDate: event.date, shares: [venueShare(measurement, sponsor, "brand")] })
})

checkInRouter.post("/:code/group/session", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  const { measurement, event } = measurementFor(req.params.code)
  await checkGroupPin(req, measurement)
  const sponsors = measurement.sponsors.length ? measurement.sponsors : [undefined]
  res.json({
    eventName: event.name,
    eventDate: event.date,
    shares: sponsors.map((sponsor) => venueShare(measurement, sponsor, "group")),
  })
})

// A venue page records what its side confirms by one of the share's
// confirmed methods (samples handed out, a booth visit stamped, a post or a
// survey checked, a purchase, goods given, a raffle entry, a sign-up, a
// try-out), or takes back a mistake (a negative amount, never below zero).
// Only on the event's days and the day after, except the demo accounts'.
async function recordAtVenue(req: Request, side: ChatSide) {
  await recordsPerClient.take(clientKey(req))
  const { measurement, event } = measurementFor(String(req.params.code))
  let sponsor: EventSponsor | undefined
  if (side === "brand") sponsor = await staffShare(req, measurement)
  else {
    await checkGroupPin(req, measurement)
    const share = text(req.body?.share) || eventCoupon
    sponsor = measurement.sponsors.find((item) => item.id === share)
    if (measurement.sponsors.length ? !sponsor : share !== eventCoupon) {
      throw new HttpError(404, "협찬을 찾을 수 없어요. 화면을 새로 고쳐 주세요.")
    }
  }
  const kind = methodKinds.find((item) => item === req.body?.method)
  if (!kind || !isVenueKind(kind)) throw new HttpError(404, "알 수 없는 협찬 확인 방식이에요.")
  const method = activeMethodsOf(measurement, sponsor).find((item) => item.kind === kind)
  if (!method) {
    throw new HttpError(409, "이 협찬은 이 방식으로 확인하지 않아요. 임시 전자 계약서가 확정됐는지 확인해 주세요.")
  }
  if (!confirmsAt(method, side)) throw new HttpError(403, "이 방식은 상대 쪽 현장 화면에서 확인해요.")
  const metric = venueMetrics[kind]
  assertOpen(getDatabase(), measurement, event, metric)
  const amount = parseAmount(kind, req.body?.amount)
  if ((sponsor ?? measurement).metrics[metric] + amount < 0) throw new HttpError(409, "되돌릴 기록이 없어요.")
  const entry = recordMetric(measurement, metric, sponsor, amount)
  await saveDatabase()
  return { entry, share: venueShare(measurement, sponsor, side) }
}

checkInRouter.post("/:code/staff/count", async (req, res) => {
  res.json(await recordAtVenue(req, "brand"))
})

checkInRouter.post("/:code/group/count", async (req, res) => {
  res.json(await recordAtVenue(req, "group"))
})
