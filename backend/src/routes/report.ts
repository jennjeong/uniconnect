import { Router } from "express"

import { getDatabase } from "../store.js"

export const reportRouter = Router()

// Goals and results of the measured event; live counts come from /api/metrics.
reportRouter.get("/", (_req, res) => {
  res.json({ report: getDatabase().report })
})
