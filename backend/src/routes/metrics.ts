import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Metrics } from "../types.js"

export const metricsRouter = Router()

const kinds: (keyof Metrics)[] = ["scans", "coupons", "visits"]

metricsRouter.get("/", (_req, res) => {
  res.json({ metrics: getDatabase().metrics })
})

// Records one QR scan, coupon or store visit (the demo console and test QR use this).
metricsRouter.post("/:kind", async (req, res) => {
  const kind = kinds.find((item) => item === req.params.kind)
  if (!kind) throw new HttpError(404, "알 수 없는 측정 항목이에요.")
  const database = getDatabase()
  database.metrics[kind] += 1
  await saveDatabase()
  res.json({ metrics: database.metrics })
})
