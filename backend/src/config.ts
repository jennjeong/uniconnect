import path from "node:path"
import { fileURLToPath } from "node:url"

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const isProduction = process.env.NODE_ENV === "production"

export const config = {
  isProduction,
  // Vite reads PORT while developing, so the API listens on API_PORT instead.
  // Hosting platforms set PORT for the single production process.
  port: Number(
    process.env.API_PORT ?? (isProduction ? process.env.PORT : undefined) ?? 4000,
  ),
  dataFile: process.env.DATA_FILE ?? path.join(backendRoot, "data", "db.json"),
  frontendDist: process.env.FRONTEND_DIST ?? path.resolve(backendRoot, "..", "frontend", "dist"),
  // Only needed when the frontend is hosted on another origin.
  corsOrigin: process.env.CORS_ORIGIN,
  emailCodeTtlMs: 3 * 60 * 1000,
  emailCodeMaxAttempts: 5,
  verificationTtlMs: 30 * 60 * 1000,
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  // No mail service is connected yet, so codes are returned to the client for
  // the demo. Set EXPOSE_EMAIL_CODES=false once real emails are sent.
  exposeEmailCodes: process.env.EXPOSE_EMAIL_CODES
    ? process.env.EXPOSE_EMAIL_CODES === "true"
    : !isProduction,
}
