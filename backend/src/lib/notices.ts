import { config } from "../config.js"
import { sendMail } from "./mailer.js"
import type { Account } from "../types.js"

// Tells an account by email that something waits for it: a proposal, an
// answer or a message, with a link to the page when SITE_URL is set. It
// never holds up or fails the request that caused it.
export function notify(account: Account | undefined, subject: string, lines: string[], path: string) {
  if (!account) return Promise.resolve()
  const link = config.siteUrl ? `${config.siteUrl.replace(/\/$/, "")}${path}` : undefined
  const text = [...lines, ...(link ? ["", `바로 가기: ${link}`] : []), "", "uniconnect"].join("\n")
  return sendMail(account.email, `[uniconnect] ${subject}`, text).catch((error: Error) => {
    console.error(`[mail] notice "${subject}": ${error.message}`)
  })
}
