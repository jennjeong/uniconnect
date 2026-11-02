import { existsSync } from "node:fs"
import path from "node:path"
import express, { type ErrorRequestHandler } from "express"

import { config } from "./config.js"
import { isAppPath } from "./lib/appPaths.js"
import { recordError } from "./lib/errorLog.js"
import { HttpError } from "./lib/errors.js"
import { langOf, translate } from "./lib/i18n.js"
import { readSession } from "./middleware/session.js"
import { adminRouter } from "./routes/admin.js"
import { announcementsRouter } from "./routes/announcements.js"
import { adminMoreRouter } from "./routes/adminMore.js"
import { siteRouter } from "./routes/site.js"
import { agreementsRouter } from "./routes/agreements.js"
import { analyticsRouter } from "./routes/analytics.js"
import { authRouter } from "./routes/auth.js"
import { teamRouter } from "./routes/team.js"
import { councilRouter } from "./routes/council.js"
import { socialRouter } from "./routes/social.js"
import { brandsRouter } from "./routes/brands.js"
import { calendarRouter } from "./routes/calendar.js"
import { checkInRouter } from "./routes/checkin.js"
import { conversationsRouter } from "./routes/conversations.js"
import { cronRouter } from "./routes/cron.js"
import { errorsRouter } from "./routes/errors.js"
import { eventsRouter } from "./routes/events.js"
import { groupsRouter } from "./routes/groups.js"
import { inquiriesRouter } from "./routes/inquiries.js"
import { insightsRouter } from "./routes/insights.js"
import { ledgerRouter } from "./routes/ledger.js"
import { invitesRouter } from "./routes/invites.js"
import { matchesRouter } from "./routes/matches.js"
import { measurementsRouter } from "./routes/measurements.js"
import { offersRouter } from "./routes/offers.js"
import { placesRouter } from "./routes/places.js"
import { profileRouter } from "./routes/profile.js"
import { proposalsRouter } from "./routes/proposals.js"
import { requestsRouter } from "./routes/requests.js"
import { billingRouter } from "./routes/billing.js"
import { boardRouter } from "./routes/board.js"
import { blocksRouter, reportsRouter } from "./routes/reports.js"
import { reviewsRouter } from "./routes/reviews.js"
import { savedRouter } from "./routes/saved.js"
import { getDatabase, refreshDatabase } from "./store.js"

// `loaded`: on Vercel (vercel.ts), each copy of the API reads the data on
// its first request rather than at start.
export function createApp({ loaded }: { loaded?: () => Promise<void> } = {}) {
  const app = express()
  app.disable("x-powered-by")
  if (config.trustProxy !== undefined) app.set("trust proxy", config.trustProxy)

  if (config.corsOrigin) {
    const origin = config.corsOrigin
    app.use((req, res, next) => {
      res.set({
        "Access-Control-Allow-Origin": origin,
        // X-Admin-Token: the operators' screen (/admin) from that origin too.
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
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
  // scripts (and Google Analytics, and Toss Payments' window for paying),
  // and no other site may frame it.
  app.use((_req, res, next) => {
    res.set({
      "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' https://www.googletagmanager.com https://js.tosspayments.com https://dapi.kakao.com https://t1.daumcdn.net https://t1.kakaocdn.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://*.tosspayments.com",
        "frame-src 'self' https://*.tosspayments.com postcode.map.kakao.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://*.tosspayments.com",
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

  // A file sent in a conversation (a PDF up to 2 MB, as base64) needs a
  // larger body than the rest; it is parsed here first.
  app.use("/api/conversations/:id/attachments", express.json({ limit: "3mb" }))
  // So does an event's plan (a PDF up to 2 MB, routes/events.ts).
  app.use("/api/events/:id/plan", express.json({ limit: "3mb" }))
  // Room for a resized logo (routes/profile.ts caps one at about 100KB).
  app.use(express.json({ limit: "300kb" }))
  // The data is in, and as other copies of the API left it (store.ts), before
  // the session or anything else is read.
  app.use("/api", async (_req, _res, next) => {
    await loaded?.()
    await refreshDatabase()
    next()
  })
  app.use(readSession)
  // Maintenance (set from the console): the site keeps answering reads,
  // and turns writes away, except the operators' and logging in.
  app.use("/api", (req, _res, next) => {
    const maintenance = getDatabase().settings?.maintenance
    const open = req.method === "GET" || req.path.startsWith("/admin") || req.path.startsWith("/auth/login") || req.path.startsWith("/errors")
    if (maintenance?.on && !open) throw new HttpError(503, "지금은 점검 중이에요. 점검이 끝나면 다시 시도해 주세요.")
    next()
  })

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true })
  })
  app.use("/api/auth/social", socialRouter)
  app.use("/api/auth", authRouter)
  app.use("/api/team", teamRouter)
  app.use("/api/council", councilRouter)
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
  app.use("/api/insights", insightsRouter)
  app.use("/api/ledger", ledgerRouter)
  app.use("/api/profile", profileRouter)
  app.use("/api/places", placesRouter)
  app.use("/api/invites", invitesRouter)
  app.use("/api/agreements", agreementsRouter)
  app.use("/api/reviews", reviewsRouter)
  app.use("/api/conversations", conversationsRouter)
  app.use("/api/inquiries", inquiriesRouter)
  app.use("/api/reports", reportsRouter)
  app.use("/api/blocks", blocksRouter)
  app.use("/api/saved", savedRouter)
  app.use("/api/calendar", calendarRouter)
  app.use("/api/board", boardRouter)
  app.use("/api/errors", errorsRouter)
  app.use("/api/billing", billingRouter)
  app.use("/api/admin", adminRouter)
  app.use("/api/admin", adminMoreRouter)
  app.use("/api/announcements", announcementsRouter)
  app.use("/api/site", siteRouter)
  app.use("/api/cron", cronRouter)
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

  // Messages are written in Korean and answered in the request's language
  // (lib/i18n.ts).
  const handleError: ErrorRequestHandler = (error, req, res, _next) => {
    const say = (status: number, message: string) =>
      res.status(status).json({ error: translate(message, langOf(req)) })
    // A failure on the server's side is kept for the operators (lib/errorLog.ts):
    // the request's method and path, the message, and for an unexpected
    // error the first frames of its stack.
    const keep = (message: string, stack?: string) =>
      void recordError({
        source: "server",
        message,
        where: `${req.method} ${req.originalUrl.split("?")[0]}`,
        path: req.originalUrl,
        ...(stack ? { stack: stack.split("\n").slice(1, 4).map((line) => line.trim()).join("\n") } : {}),
      })
    if (error instanceof HttpError) {
      if (error.status >= 500) keep(error.message)
      say(error.status, error.message)
      return
    }
    if (error?.type === "entity.parse.failed") {
      say(400, "요청 형식이 올바르지 않아요.")
      return
    }
    // The request's own fault, as Express and the body parser mark it: a
    // body over the size limit, an address that cannot be decoded and the
    // like. Answered as such, not logged as a server error.
    const status = typeof error?.status === "number" ? error.status : typeof error?.statusCode === "number" ? error.statusCode : 0
    if (status >= 400 && status < 500) {
      say(status, status === 413 ? "보낸 내용이 너무 커요. 내용을 줄여서 다시 보내 주세요." : "요청 형식이 올바르지 않아요.")
      return
    }
    console.error(error)
    keep(error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined)
    say(500, "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.")
  }
  app.use(handleError)

  return app
}
