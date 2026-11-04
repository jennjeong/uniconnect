import type { Request } from "express"
import { Router } from "express"

import { todayInKorea } from "../lib/dates.js"
import { isDemoAccount } from "../lib/reviews.js"
import { HttpError } from "../lib/errors.js"
import {
  applySponsorGoals,
  buildReport,
  ensureMeasurement,
  parseGoals,
  parseKind,
  parseStaffPin,
  pinsFrom,
  pinsOpen,
} from "../lib/measurements.js"
import { postedReach } from "../lib/snsPosts.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { EventItem, Measurement } from "../types.js"

export const measurementsRouter = Router()

// 어느 계정의 행사를 보여 줄지 정한다. 로그인한 계정(단체의 행사, 브랜드의
// 캠페인)이거나, 방문자에게는 미리 보는 쪽의 데모 계정이다(?role=, 기본은
// 학생 쪽).
function measurementOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account
  const role = req.query.role === "브랜드" ? "브랜드" : "학생단체"
  return database.accounts.find((account) => account.id === database.demoAccountIds[role])
}

// PIN은 행사 전날부터 로그인한 주인에게만 준다. 매장 PIN이 있고, 주인이
// 학생단체이면 단체의 현장 PIN도 있다. 그 전에는 리포트가 언제 보일지 알려 준다.
function pinsFor(req: Request, measurement: Measurement, event: EventItem) {
  if (!req.account) return {}
  if (!pinsOpen(getDatabase(), measurement, event)) return { pinsDay: pinsFrom(event) }
  return { withPin: true, withGroupPin: req.account.role === "학생단체" }
}

// 행사의 리포트. SNS 게시물의 도달을 함께 담는다.
const reportOf = (req: Request, measurement: Measurement, event: EventItem) =>
  buildReport(measurement, event, { ...pinsFor(req, measurement, event), posted: postedReach(getDatabase(), measurement) })

// 주인의 행사와 그 측정이다. 처음 열 때 측정을 만든다.
async function ownedMeasurement(req: Request) {
  const database = getDatabase()
  const owner = measurementOwner(req)
  const event = owner && (database.events[owner.id] ?? []).find((item) => item.id === req.params.eventId)
  if (!owner || !event) throw new HttpError(404, "행사를 찾을 수 없어요.")
  const { measurement, created } = ensureMeasurement(database, owner.id, event)
  if (created) await saveDatabase()
  return { measurement, event }
}

// 단체의 모든 행사를 실시간 집계와 리포트와 함께 최신순으로 보여 준다.
measurementsRouter.get("/", async (req, res) => {
  const database = getDatabase()
  const owner = measurementOwner(req)
  const events = owner ? [...(database.events[owner.id] ?? [])] : []
  let changed = false
  const measurements = events
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((event) => {
      const { measurement, created } = ensureMeasurement(database, owner!.id, event)
      changed ||= created
      return { eventId: event.id, metrics: measurement.metrics, report: reportOf(req, measurement, event) }
    })
  if (changed) await saveDatabase()
  res.json({ measurements })
})

measurementsRouter.get("/:eventId", async (req, res) => {
  const { measurement, event } = await ownedMeasurement(req)
  res.json({ metrics: measurement.metrics, report: reportOf(req, measurement, event) })
})

// 참여 기록을 최신순으로 보여 주며, ?kind=로 측정 하나로 좁힐 수 있다.
measurementsRouter.get("/:eventId/log", async (req, res) => {
  const { measurement } = await ownedMeasurement(req)
  const kind = req.query.kind === undefined ? undefined : parseKind(req.query.kind)
  const entries = measurement.log
    .filter((entry) => !kind || entry.kind === kind)
    .slice(-50)
    .reverse()
  res.json({ entries })
})

// 단체가 행사의 목표를 정한다. 예상 관객, 평균 지출, 행사장 밖 도달, 협찬의
// 가치, 목표치, 쿠폰을 정하고, 브랜드가 협찬한 뒤에는 협찬사마다의 쿠폰, 가치,
// 직원 PIN을 정한다. 행사를 가진 로그인한 단체만 할 수 있다.
measurementsRouter.put("/:eventId/goals", async (req, res) => {
  requireAccount(req)
  const { measurement, event } = await ownedMeasurement(req)
  // e-contract에 적힌 대로 행사 전에만 정한다. 행사가 시작되면 결과를 읽는
  // 기준이 되는 목표는 그대로 둔다. 방문자가 써 볼 수 있도록 데모 계정의
  // 행사는 체크인 기간처럼 계속 열려 있다.
  const database = getDatabase()
  const demo = isDemoAccount(database, database.accounts.find((item) => item.id === measurement.accountId))
  if (!demo && event.date <= todayInKorea()) throw new HttpError(409, "시작한 행사의 목표는 바꿀 수 없어요.")
  const goals = parseGoals(req.body)
  const staffPin = parseStaffPin(req.body?.staffPin)
  applySponsorGoals(measurement, goals, req.body?.sponsors)
  measurement.goals = goals
  if (staffPin) measurement.staffPin = staffPin
  await saveDatabase()
  res.json({ metrics: measurement.metrics, report: reportOf(req, measurement, event) })
})
