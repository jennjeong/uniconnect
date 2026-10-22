import type { Request } from "express"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { buildReport, ensureMeasurement, parseGoals, parseKind, parseStaffPin } from "../lib/measurements.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"

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
      return { eventId: event.id, metrics: measurement.metrics, report: buildReport(measurement, event, { withPin: Boolean(req.account) }) }
    })
  if (changed) await saveDatabase()
  res.json({ measurements })
})

measurementsRouter.get("/:eventId", async (req, res) => {
  const { measurement, event } = await ownedMeasurement(req)
  res.json({ metrics: measurement.metrics, report: buildReport(measurement, event, { withPin: Boolean(req.account) }) })
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
// beyond the venue, the sponsorship's value, targets and the coupon. Only
// the logged-in group that owns the event can.
measurementsRouter.put("/:eventId/goals", async (req, res) => {
  requireAccount(req)
  const goals = parseGoals(req.body)
  const staffPin = parseStaffPin(req.body?.staffPin)
  const { measurement, event } = await ownedMeasurement(req)
  measurement.goals = goals
  if (staffPin) measurement.staffPin = staffPin
  await saveDatabase()
  res.json({ metrics: measurement.metrics, report: buildReport(measurement, event, { withPin: Boolean(req.account) }) })
})
