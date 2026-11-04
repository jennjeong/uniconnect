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
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { EventItem, Measurement } from "../types.js"

export const measurementsRouter = Router()

// Whose events to show: the logged-in account (a group's events, a brand's
// campaigns), or for visitors the demo account of the side they preview
// (?role=, the student side by default).
function measurementOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account
  const role = req.query.role === "브랜드" ? "브랜드" : "학생단체"
  return database.accounts.find((account) => account.id === database.demoAccountIds[role])
}

// The PINs go to the logged-in owner only, from the day before the event:
// the store PINs, and the group's venue PIN when the owner is the student
// group. Until then the report says when they will show.
function pinsFor(req: Request, measurement: Measurement, event: EventItem) {
  if (!req.account) return {}
  if (!pinsOpen(getDatabase(), measurement, event)) return { pinsDay: pinsFrom(event) }
  return { withPin: true, withGroupPin: req.account.role === "학생단체" }
}

// The owner's event with its measurement, created the first time it is opened.
async function ownedMeasurement(req: Request) {
  const database = getDatabase()
  const owner = measurementOwner(req)
  const event = owner && (database.events[owner.id] ?? []).find((item) => item.id === req.params.eventId)
  if (!owner || !event) throw new HttpError(404, "행사를 찾을 수 없어요.")
  const { measurement, created } = ensureMeasurement(database, owner.id, event)
  if (created) await saveDatabase()
  return { measurement, event }
}

// Every event of the group with its live counts and report, latest first.
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
      return { eventId: event.id, metrics: measurement.metrics, report: buildReport(measurement, event, pinsFor(req, measurement, event)) }
    })
  if (changed) await saveDatabase()
  res.json({ measurements })
})

measurementsRouter.get("/:eventId", async (req, res) => {
  const { measurement, event } = await ownedMeasurement(req)
  res.json({ metrics: measurement.metrics, report: buildReport(measurement, event, pinsFor(req, measurement, event)) })
})

// Participation history, newest first; ?kind= narrows it to one measurement.
measurementsRouter.get("/:eventId/log", async (req, res) => {
  const { measurement } = await ownedMeasurement(req)
  const kind = req.query.kind === undefined ? undefined : parseKind(req.query.kind)
  const entries = measurement.log
    .filter((entry) => !kind || entry.kind === kind)
    .slice(-50)
    .reverse()
  res.json({ entries })
})

// The group sets the event's goals: expected audience, average spend, reach
// beyond the venue, the sponsorship's value, targets and the coupon, or each
// sponsor's coupon, value and staff PIN once brands sponsor it. Only the
// logged-in group that owns the event can.
measurementsRouter.put("/:eventId/goals", async (req, res) => {
  requireAccount(req)
  const { measurement, event } = await ownedMeasurement(req)
  // Set before the event, as the e-contract says: once it begins, the goals
  // its results are read against stay as they were. The demo accounts'
  // events stay open, as their check-in windows do, for visitors to try.
  const database = getDatabase()
  const demo = isDemoAccount(database, database.accounts.find((item) => item.id === measurement.accountId))
  if (!demo && event.date <= todayInKorea()) throw new HttpError(409, "시작한 행사의 목표는 바꿀 수 없어요.")
  const goals = parseGoals(req.body)
  const staffPin = parseStaffPin(req.body?.staffPin)
  applySponsorGoals(measurement, goals, req.body?.sponsors)
  measurement.goals = goals
  if (staffPin) measurement.staffPin = staffPin
  await saveDatabase()
  res.json({ metrics: measurement.metrics, report: buildReport(measurement, event, pinsFor(req, measurement, event)) })
})
