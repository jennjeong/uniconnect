import { randomUUID } from "node:crypto"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { MetricEntry, MetricKind } from "../types.js"

export const metricsRouter = Router()

const kinds: MetricKind[] = ["scans", "coupons", "visits"]

// Note saved with each record from the check-in page.
export const entryDetails: Record<MetricKind, string> = {
  scans: "현장 QR 스캔",
  coupons: "아메리카노 1+1 쿠폰",
  visits: "매장 방문 확인",
}

// Only the most recent records are kept; the counts in metrics stay exact.
const logLimit = 300

function parseKind(value: unknown) {
  const kind = kinds.find((item) => item === value)
  if (!kind) throw new HttpError(404, "알 수 없는 측정 항목이에요.")
  return kind
}

metricsRouter.get("/", (_req, res) => {
  res.json({ metrics: getDatabase().metrics })
})

// Participation history, newest first; ?kind= narrows it to one measurement.
metricsRouter.get("/log", (req, res) => {
  const kind = req.query.kind === undefined ? undefined : parseKind(req.query.kind)
  const entries = getDatabase()
    .metricLog.filter((entry) => !kind || entry.kind === kind)
    .slice(-50)
    .reverse()
  res.json({ entries })
})

// The check-in page needs no login, so each address may record only so
// many a minute; a busy booth on one Wi-Fi stays well under it.
const recordsPerClient = createRateLimit({
  limit: 120,
  windowMs: 60 * 1000,
  message: "기록 요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
})

// Records one QR scan, coupon or store visit (called by the check-in page).
metricsRouter.post("/:kind", async (req, res) => {
  recordsPerClient.take(clientKey(req))
  const kind = parseKind(req.params.kind)
  const database = getDatabase()
  database.metrics[kind] += 1
  const entry: MetricEntry = {
    id: randomUUID(),
    kind,
    at: new Date().toISOString(),
    participant: `참여자 #${database.metrics[kind]}`,
    detail: entryDetails[kind],
  }
  database.metricLog = [...database.metricLog, entry].slice(-logLimit)
  await saveDatabase()
  res.json({ metrics: database.metrics, entry })
})
