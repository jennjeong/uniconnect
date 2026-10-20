import { existsSync } from "node:fs"
import path from "node:path"
import express, { type ErrorRequestHandler } from "express"

import { config } from "./config.js"
import { HttpError } from "./lib/errors.js"
import { readSession } from "./middleware/session.js"
import { analyticsRouter } from "./routes/analytics.js"
import { authRouter } from "./routes/auth.js"
import { brandsRouter } from "./routes/brands.js"
import { eventsRouter } from "./routes/events.js"
import { groupsRouter } from "./routes/groups.js"
import { matchesRouter } from "./routes/matches.js"
import { metricsRouter } from "./routes/metrics.js"
import { proposalsRouter } from "./routes/proposals.js"
import { reportRouter } from "./routes/report.js"
import { requestsRouter } from "./routes/requests.js"

export function createApp() {
  const app = express()
  app.disable("x-powered-by")

  if (config.corsOrigin) {
    const origin = config.corsOrigin
    app.use((req, res, next) => {
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      })
      if (req.method === "OPTIONS") {
        res.status(204).end()
        return
      }
      next()
    })
  }

  app.use(express.json({ limit: "100kb" }))
  app.use(readSession)

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true })
  })
  app.use("/api/auth", authRouter)
  app.use("/api/matches", matchesRouter)
  app.use("/api/brands", brandsRouter)
  app.use("/api/groups", groupsRouter)
  app.use("/api/events", eventsRouter)
  app.use("/api/proposals", proposalsRouter)
  app.use("/api/requests", requestsRouter)
  app.use("/api/metrics", metricsRouter)
  app.use("/api/report", reportRouter)
  app.use("/api/analytics", analyticsRouter)
  app.use("/api", () => {
    throw new HttpError(404, "없는 API 경로예요.")
  })

  // After `npm run build`, the same server also serves the built frontend.
  if (existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist))
    app.use((req, res, next) => {
      if (req.method !== "GET") return next()
      res.sendFile(path.join(config.frontendDist, "index.html"))
    })
  }

  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message })
      return
    }
    if (error?.type === "entity.parse.failed") {
      res.status(400).json({ error: "요청 형식이 올바르지 않아요." })
      return
    }
    console.error(error)
    res.status(500).json({ error: "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요." })
  }
  app.use(handleError)

  return app
}
