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
  frontendDist: process.env.FRONTEND_DIST ?? path.resolve(backendRoot, "..", "frontend", "dist"),
  // Lets operators read and answer questions through /api/admin (sent as
  // the X-Admin-Token header). Those routes stay closed while it is unset.
  adminToken: process.env.ADMIN_TOKEN,
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  // Only needed when the frontend is hosted on another origin.
  corsOrigin: process.env.CORS_ORIGIN,
  emailCodeTtlMs: 3 * 60 * 1000,
  emailCodeMaxAttempts: 5,
  // Wrong guesses keep counting across new codes for this long.
  emailCodeAttemptWindowMs: 30 * 60 * 1000,
  verificationTtlMs: 30 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  exposeEmailCodes: emailCodesExposed(process.env),
}
