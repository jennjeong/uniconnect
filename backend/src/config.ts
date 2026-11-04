import path from "node:path"
import { fileURLToPath } from "node:url"

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const isProduction = process.env.NODE_ENV === "production"

// No mail service is connected yet, so sign-up can hand the code back to the
// client (devCode) for a demo. That lets anyone sign up with any address, so
// it is off unless EXPOSE_EMAIL_CODES=true; `npm run dev` turns it on through
// backend/dev.env.
export const emailCodesExposed = (env: NodeJS.ProcessEnv) => env.EXPOSE_EMAIL_CODES === "true"

// Behind a proxy or a hosting platform's load balancer, req.ip is the proxy
// unless Express trusts X-Forwarded-For: "true", a hop count, or addresses.
function trustProxy(value: string | undefined) {
  if (!value) return undefined
  if (value === "true") return true
  return /^\d+$/.test(value) ? Number(value) : value
}

export const config = {
  isProduction,
  // Vite reads PORT while developing, so the API listens on API_PORT instead.
  // Hosting platforms set PORT for the single production process.
  port: Number(
    process.env.API_PORT ?? (isProduction ? process.env.PORT : undefined) ?? 4000,
  ),
  dataFile: process.env.DATA_FILE ?? path.join(backendRoot, "data", "db.json"),
  // A Postgres database to keep the data and agreement photos in, for hosts
  // where files don't last, such as Vercel (its Neon integration sets
  // DATABASE_URL). Without it they stay in dataFile and beside it.
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  // Vercel Cron sends it as a bearer token to the daily reminders
  // (vercel.json, routes/cron.ts), which stay closed while it is unset.
  cronSecret: process.env.CRON_SECRET,
  frontendDist: process.env.FRONTEND_DIST ?? path.resolve(backendRoot, "..", "frontend", "dist"),
  // Lets operators read and answer questions through /api/admin (sent as
  // the X-Admin-Token header). Those routes stay closed while it is unset.
  adminToken: process.env.ADMIN_TOKEN,
  // On Vercel its edge, one hop in front, sets X-Forwarded-For itself.
  trustProxy: trustProxy(process.env.TRUST_PROXY ?? (process.env.VERCEL ? "1" : undefined)),
  // Sends verification codes by email through Resend once both are set
  // (lib/mailer.ts); MAIL_FROM is like "uniconnect <no-reply@example.com>".
  resendApiKey: process.env.RESEND_API_KEY,
  // The site's address, for links in notice emails (like https://uniconnect.kr).
  siteUrl: process.env.SITE_URL,
  mailFrom: process.env.MAIL_FROM,
  // Only needed when the frontend is hosted on another origin.
  corsOrigin: process.env.CORS_ORIGIN,
  // Kakao Local's REST key (developers.kakao.com), for the live shops around a
  // campus (lib/places.ts). Kakao allows its results only as live answers, so
  // nothing from it is kept.
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY,
  // Kakao Maps' JavaScript key, for the map on 가까운 순; the browser sends
  // it, limited to the site's domains in Kakao's console. Without it the
  // app draws its own sketch.
  kakaoMapKey: process.env.KAKAO_JS_KEY,
  // Logging in with Kakao or Naver (routes/social.ts): each provider shows
  // once its client ID is set (Kakao's is the app's REST API key, its secret
  // optional; Naver's needs both). The redirect address to register with the
  // provider is SITE_URL + /api/auth/social/<provider>/callback.
  kakaoClientId: process.env.KAKAO_LOGIN_CLIENT_ID,
  kakaoClientSecret: process.env.KAKAO_LOGIN_CLIENT_SECRET,
  naverClientId: process.env.NAVER_CLIENT_ID,
  naverClientSecret: process.env.NAVER_CLIENT_SECRET,
  // An OpenStreetMap Nominatim server (like https://nominatim.openstreetmap.org)
  // for placing a brand's store address on the map (lib/geocode.ts). Without
  // it addresses are kept but have no distance.
  nominatimUrl: process.env.NOMINATIM_URL,
  // A YouTube Data API key for the view counts of SNS posts (lib/snsPosts.ts).
  // Without it posts are confirmed by their links and screenshots.
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  // Where the operators hear of a new error after a quiet hour
  // (lib/errorLog.ts), once mail is set up.
  operatorEmail: process.env.OPERATOR_EMAIL,
  // The data.go.kr key for the National Tax Service's business registration
  // check (lib/business.ts); without it brands can't verify their business.
  ntsServiceKey: process.env.NTS_SERVICE_KEY,
  // Toss Payments' API keys (개별 연동 키: test_ck/test_sk, then live_ck/live_sk
  // once the PG contract is signed) for card payments (lib/billing.ts). The
  // client key goes to the payment window; the secret key stays here.
  tossClientKey: process.env.TOSS_CLIENT_KEY,
  tossSecretKey: process.env.TOSS_SECRET_KEY,
  emailCodeTtlMs: 3 * 60 * 1000,
  emailCodeMaxAttempts: 5,
  // Codes one address may ask for in 15 minutes (and check, 10 more). The
  // browser tests raise it, as each of them signs up from the same address.
  codesPerClient: Number(process.env.CODES_PER_CLIENT) || 20,
  // Wrong guesses keep counting across new codes for this long.
  emailCodeAttemptWindowMs: 30 * 60 * 1000,
  verificationTtlMs: 30 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  exposeEmailCodes: emailCodesExposed(process.env),
}
