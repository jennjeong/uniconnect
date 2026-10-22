import type { Request } from "express"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { buildReport, ensureMeasurement, parseKind } from "../lib/measurements.js"
import { getDatabase, saveDatabase } from "../store.js"

export const measurementsRouter = Router()

// Group whose events to show: the logged-in student group, or the demo
// group for visitors previewing the student side. Brands measure nothing.
function measurementOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account.role === "학생단체" ? req.account : undefined
  return database.accounts.find((account) => account.id === database.demoAccountIds.학생단체)
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
      return { eventId: event.id, metrics: measurement.metrics, report: buildReport(measurement, event) }
    })
  if (changed) await saveDatabase()
  res.json({ measurements })
})

measurementsRouter.get("/:eventId", async (req, res) => {
  const { measurement, event } = await ownedMeasurement(req)
  res.json({ metrics: measurement.metrics, report: buildReport(measurement, event) })
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
