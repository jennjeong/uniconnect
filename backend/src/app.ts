import { existsSync } from "node:fs"
import path from "node:path"
import express, { type ErrorRequestHandler } from "express"

import { config } from "./config.js"
import { isAppPath } from "./lib/appPaths.js"
import { HttpError } from "./lib/errors.js"
import { readSession } from "./middleware/session.js"
import { adminRouter } from "./routes/admin.js"
import { analyticsRouter } from "./routes/analytics.js"
import { authRouter } from "./routes/auth.js"
import { brandsRouter } from "./routes/brands.js"
import { checkInRouter } from "./routes/checkin.js"
import { conversationsRouter } from "./routes/conversations.js"
import { eventsRouter } from "./routes/events.js"
import { groupsRouter } from "./routes/groups.js"
import { inquiriesRouter } from "./routes/inquiries.js"
import { matchesRouter } from "./routes/matches.js"
import { measurementsRouter } from "./routes/measurements.js"
import { offersRouter } from "./routes/offers.js"
import { profileRouter } from "./routes/profile.js"
import { proposalsRouter } from "./routes/proposals.js"
import { requestsRouter } from "./routes/requests.js"

export function createApp() {
  const app = express()
  app.disable("x-powered-by")
  if (config.trustProxy !== undefined) app.set("trust proxy", config.trustProxy)

  if (config.corsOrigin) {
    const origin = config.corsOrigin
    app.use((req, res, next) => {
      res.set({
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      })
      if (req.method === "OPTIONS") {
        res.status(204).end()
        return
      }
      next()
    })
  }

  // Security headers on every answer. The page may only run this site's own
  // scripts (and Google Analytics once it is turned on), and no other site
  // may frame it.
  app.use((_req, res, next) => {
    res.set({
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' https://www.googletagmanager.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      ...(config.isProduction ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
    })
    next()
  })

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
  app.use("/api/offers", offersRouter)
  app.use("/api/measurements", measurementsRouter)
  app.use("/api/check-in", checkInRouter)
  app.use("/api/analytics", analyticsRouter)
  app.use("/api/profile", profileRouter)
  app.use("/api/conversations", conversationsRouter)
  app.use("/api/inquiries", inquiriesRouter)
  app.use("/api/admin", adminRouter)
  app.use("/api", () => {
    throw new HttpError(404, "없는 API 경로예요.")
  })

  // After `npm run build`, the same server also serves the built frontend.
  if (existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist))
    // Every screen loads the same page; addresses with no screen answer 404
    // (the page then shows its 404 screen).
    app.use((req, res, next) => {
      if (req.method !== "GET") return next()
      res.status(isAppPath(req.path) ? 200 : 404).sendFile(path.join(config.frontendDist, "index.html"))
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
