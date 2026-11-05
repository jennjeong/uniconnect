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

// `loaded`: Vercel(vercel.ts)에서는 API의 각 복사본이 시작할 때가 아니라 첫
// 요청에서 데이터를 읽는다.
export function createApp({ loaded }: { loaded?: () => Promise<void> } = {}) {
  const app = express()
  app.disable("x-powered-by")
  if (config.trustProxy !== undefined) app.set("trust proxy", config.trustProxy)

  if (config.corsOrigin) {
    const origin = config.corsOrigin
    app.use((req, res, next) => {
      res.set({
        "Access-Control-Allow-Origin": origin,
        // X-Admin-Token: 그 출처에서도 운영자 화면(/admin)이 동작한다.
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

  // 모든 응답에 보안 헤더를 붙인다. 페이지는 이 사이트 자체의 스크립트(와
  // Google Analytics, 결제용 Toss Payments 창)만 실행할 수 있고, 다른 사이트는
  // 페이지를 프레임에 넣을 수 없다.
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

  // 대화에서 보낸 파일(base64로 된 2MB 이하의 PDF)은 나머지보다 큰 본문이
  // 필요하므로 여기서 먼저 파싱한다.
  app.use("/api/conversations/:id/attachments", express.json({ limit: "3mb" }))
  // 행사의 기획안도 마찬가지다(2MB 이하의 PDF, routes/events.ts).
  app.use("/api/events/:id/plan", express.json({ limit: "3mb" }))
  // 운영자를 기다리는 가입이 보이는 서류도 마찬가지다(lib/applications.ts).
  app.use("/api/auth/signup", express.json({ limit: "3mb" }))
  app.use("/api/invites/:code/accept", express.json({ limit: "3mb" }))
  app.use("/api/team/join", express.json({ limit: "3mb" }))
  // 줄인 로고가 들어갈 자리다(routes/profile.ts는 약 100KB로 제한한다).
  app.use(express.json({ limit: "300kb" }))
  // 세션이나 다른 것을 읽기 전에, 데이터가 들어와 있고 API의 다른 복사본이
  // 남긴 상태여야 한다(store.ts).
  app.use("/api", async (_req, _res, next) => {
    await loaded?.()
    await refreshDatabase()
    next()
  })
  app.use(readSession)
  // 점검(콘솔에서 설정)이면 사이트는 읽기에는 계속 답하고, 운영자의 쓰기와
  // 로그인을 빼고 쓰기는 돌려보낸다.
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

  // `npm run build` 뒤에는 같은 서버가 빌드한 프론트엔드도 서빙한다.
  if (existsSync(config.frontendDist)) {
    app.use(express.static(config.frontendDist))
    // 모든 화면이 같은 페이지를 불러온다. 화면이 없는 주소는 404로 답한다
    // (그러면 페이지가 404 화면을 보여 준다).
    app.use((req, res, next) => {
      if (req.method !== "GET") return next()
      res.status(isAppPath(req.path) ? 200 : 404).sendFile(path.join(config.frontendDist, "index.html"))
    })
  }

  // 메시지는 한국어로 쓰고 요청의 언어로 답한다(lib/i18n.ts).
  const handleError: ErrorRequestHandler = (error, req, res, _next) => {
    const say = (status: number, message: string) =>
      res.status(status).json({ error: translate(message, langOf(req)) })
    // 서버 쪽 실패는 운영자를 위해 남긴다(lib/errorLog.ts). 요청의 메서드와
    // 경로, 메시지, 예상 밖의 오류라면 스택의 처음 몇 줄을 담는다.
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
    // Express와 본문 파서가 표시한 요청 자체의 잘못이다. 크기 제한을 넘은 본문,
    // 해독할 수 없는 주소 같은 것이며, 그렇게 답하고 서버 오류로는 기록하지
    // 않는다.
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
