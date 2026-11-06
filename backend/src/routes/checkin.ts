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
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { ChatSide, EventSponsor, Measurement, PassCoupon } from "../types.js"

// 참여자가 행사의 QR을 스캔해 닿는 페이지다. 로그인이 필요 없으므로 행사는
// 주소에 담긴 코드만으로 찾는다.
export const checkInRouter = Router()

function measurementFor(code: string) {
  const database = getDatabase()
  const measurement = database.measurements.find((item) => item.code === code)
  const event = measurement && eventOf(database, measurement)
  if (!measurement || !event) throw new HttpError(404, "행사를 찾을 수 없어요. QR을 다시 스캔해 주세요.")
  return { measurement, event }
}

// 참여자가 받을 수 있는 쿠폰이다. 브랜드가 행사를 협찬하면 협찬사마다 하나씩
// (협찬의 id로), 아니면 행사 자체의 것 하나("event")다. 확정된 방식에 쿠폰이
// 들어 있는 협찬만 해당한다(lib/methods.ts).
const eventCoupon = "event"

function couponsOf(measurement: Measurement) {
  if (measurement.sponsors.length) {
    return measurement.sponsors
      .filter((sponsor) => usesMethod(activeMethodsOf(measurement, sponsor), "coupon"))
      .map((sponsor) => ({ id: sponsor.id, ...sponsor.coupon }))
  }
  return usesMethod(activeMethodsOf(measurement), "coupon") ? [{ id: eventCoupon, ...measurement.goals.coupon }] : []
}

// id로 찾는 패스의 쿠폰이다. 행사의 것은 패스 자체에, 협찬사의 것은 그
// id 아래에 있다.
function passCoupon(pass: Measurement["passes"][string], id: string): PassCoupon | undefined {
  return id === eventCoupon ? pass : pass.sponsors?.[id]
}

// 참여자가 보는 것이다. 행사, 단체, 쿠폰이다.
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

// 주소마다 1분에 기록할 수 있는 수를 제한한다. 한 와이파이를 쓰는 붐비는
// 부스도 이 한도에 훨씬 못 미친다.
const recordsPerClient = createRateLimit({
  limit: 120,
  windowMs: 60 * 1000,
  message: "기록 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// 폰 하나는 한 번만 센다(페이지가 자기 패스를 보관한다). 그래서 같은 주소와
// 브라우저에서 한 행사를 여러 번 스캔해도 수가 부풀지 않는다. 캠퍼스 와이파이를
// 함께 쓰는 서로 다른 폰의 사람들은 이 한도에 훨씬 못 미친다.
const scansPerDevice = createRateLimit({
  limit: 20,
  windowMs: 10 * 60 * 1000,
  message: "같은 기기에서 QR을 너무 많이 스캔했어요. 참여는 한 번만 기록돼요.",
})

const deviceKey = (req: Request, code: string) =>
  createHash("sha256").update(`${clientKey(req)} ${req.get("user-agent") ?? ""} ${code}`).digest("hex")

// 직원 PIN이 틀린 횟수를 주소와 행사별로, 행사 단독으로도 센다. 네 자리
// 숫자는 한 곳에서도 여러 곳에서도 추측할 수 없어야 한다(행사 한도에서
// 1만 개를 모두 시도하는 데 약 80시간이 걸린다).
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

// 직원이 입력하는 쿠폰 번호다. 헷갈리는 0/O와 1/I는 쓰지 않는다.
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

// 참여자가 답해도 되는 세 가지 질문은 패스가 있어야 받는다. 행사의 집계만
// 보관하고, 패스는 답했다는 사실만 기억한다.
checkInRouter.post("/:code/survey", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  await retryConflicts(() => recordSurvey(req))
  res.status(201).json({ ok: true })
})

async function recordSurvey(req: Request<{ code: string }>) {
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
}

// 참여자의 폰이다. 스캔하면 패스가 돌아오고, 패스는 쿠폰마다 한 번씩
// 받아(`couponId`는 쿠폰이 하나뿐이면 생략할 수 있다) 각자 번호를 얻는다.
// 매장 방문은 여기서 기록하지 않는다.
checkInRouter.post("/:code/:kind", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  const first = measurementFor(req.params.code)
  const kind = parseKind(req.params.kind, checkInKinds)
  if (kind !== "visits") assertOpen(getDatabase(), first.measurement, first.event, kind)
  // 데모 계정의 행사는 방문자가 써 볼 수 있게 열려 있다. 다시 시도해도 스캔은
  // 한 번이므로 한도는 여기서 한 번만 센다.
  if (kind === "scans" && !isDemoEvent(getDatabase(), first.measurement)) await scansPerDevice.take(deviceKey(req, req.params.code))
  // 행사 현장에서 몰리는 쓰기라, 다른 복사본에 밀리면 최신 데이터에서 다시 한다.
  res.json(await retryConflicts(() => recordCheckIn(req, kind)))
})

async function recordCheckIn(req: Request<{ code: string }>, kind: ReturnType<typeof parseKind>) {
  const { measurement, event } = measurementFor(req.params.code)
  if (kind !== "visits") assertOpen(getDatabase(), measurement, event, kind)

  if (kind === "scans") {
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
    return { entry, pass }
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
  return { entry, coupon }
}

// 참여자의 폰이 매장이 방문을 확인했는지 묻는다.
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

// 매장 직원의 기기(/check-in/<code>/staff)다. 참여자의 쿠폰 번호와 직원 PIN이
// 방문 한 건을 기록한다. 브랜드가 행사를 협찬하면 매장마다 자기 PIN이 있고,
// 그 PIN은 자기 쿠폰만 확인한다. PIN을 참여자의 폰에서 입력하거나 보내는
// 일은 없다.
checkInRouter.post("/:code/staff/visits", async (req, res) => {
  await recordsPerClient.take(clientKey(req))
  res.json(await retryConflicts(() => recordVisit(req)))
})

async function recordVisit(req: Request<{ code: string }>) {
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
  return { entry, store: (sponsor?.coupon ?? measurement.goals.coupon).store }
}

// 틀린 PIN은 주소(이 행사에서)와 행사에 세며, 운영자 경보가 읽는 오늘의
// 집계에도 넣는다.
async function refusePin(req: Request, message: string): Promise<never> {
  const addressKey = `${clientKey(req)} ${req.params.code}`
  await pinFailures.hit(addressKey)
  await pinFailuresPerEvent.hit(String(req.params.code))
  const measurement = getDatabase().measurements.find((item) => item.code === req.params.code)
  if (measurement) {
    const today = todayInKorea()
    measurement.pinMisses = { day: today, count: measurement.pinMisses?.day === today ? measurement.pinMisses.count + 1 : 1 }
    // 기록일 뿐이므로 저장에 실패해도 답은 바뀌지 않는다.
    await saveDatabase().catch(() => undefined)
  }
  throw new HttpError(403, message)
}

async function checkPinLimits(req: Request) {
  await pinFailures.check(`${clientKey(req)} ${req.params.code}`)
  await pinFailuresPerEvent.check(String(req.params.code))
}

// 브랜드의 페이지(/staff)는 받은 매장 PIN에 해당하는 몫을 연다. 협찬사의
// 몫이거나, 협찬사가 없는 동안에는 행사 자체의 몫이다.
async function staffShare(req: Request, measurement: Measurement): Promise<EventSponsor | undefined> {
  await checkPinLimits(req)
  const pin = text(req.body?.pin)
  const sponsor = measurement.sponsors.find((item) => item.staffPin === pin)
  if (measurement.sponsors.length ? !sponsor : pin !== measurement.staffPin) {
    await refusePin(req, "직원 PIN이 맞지 않아요. 행사 주최 측에 확인해 주세요.")
  }
  return sponsor
}

// 학생단체의 페이지(/group)는 단체 자신의 PIN을 받아 행사의 모든 몫을
// 연다.
async function checkGroupPin(req: Request, measurement: Measurement) {
  await checkPinLimits(req)
  if (text(req.body?.pin) !== measurement.groupPin) {
    await refusePin(req, "단체 확인 PIN이 맞지 않아요. 임시 전자 계약서에서 확인해 주세요.")
  }
}

// 현장 페이지가 보여 주는 몫 하나다. 누구의 것인지, 이쪽이 거기서 확정하는
// 방식(단독이거나 상대편과 함께), 지금까지의 집계를 담는다.
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

// PIN이 맞으면 현장 페이지가 행사와 함께 보여 주는 것이다. 브랜드의
// 페이지는 자기 몫을, 단체의 페이지는 모든 몫을 보여 준다.
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

// 현장 페이지는 이쪽이 확정한 방식으로 몫의 확정된 방법 중 하나로 기록한다
// (나눠 준 샘플, 도장 찍은 부스 방문, 확인한 게시글이나 설문, 구매, 준 굿즈,
// 응모, 가입, 체험). 또는 실수를 되돌린다(음수이며 0 밑으로는 내려가지
// 않는다). 행사 기간과 그다음 날에만 되며, 데모 계정은 예외다.
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
