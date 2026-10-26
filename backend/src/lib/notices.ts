import { waitUntil } from "@vercel/functions"

import { config } from "../config.js"
import { sendMail } from "./mailer.js"
import { getDatabase } from "../store.js"
import type { Account } from "../types.js"

// The shared demo accounts are never emailed: everyone trying the demo uses
// them, so their addresses stand for no one, and one is on a real
// university's domain. Nor are accounts the operators suspended.
const isDemo = (account: Account) => Object.values(getDatabase().demoAccountIds).includes(account.id)

// Tells an account by email that something waits for it: a proposal, an
// answer or a message, with a link to the page when SITE_URL is set. It
// never holds up or fails the request that caused it. On Vercel a function
// may stop once its answer is sent, so waitUntil keeps it running until the
// mail has gone; elsewhere that does nothing.
export function notify(account: Account | undefined, subject: string, lines: string[], path: string) {
  if (!account || isDemo(account) || account.suspendedAt) return Promise.resolve()
  const link = config.siteUrl ? `${config.siteUrl.replace(/\/$/, "")}${path}` : undefined
  const text = [...lines, ...(link ? ["", `바로 가기: ${link}`] : []), "", "uniconnect"].join("\n")
  const sending = sendMail(account.email, `[uniconnect] ${subject}`, text).catch((error: Error) => {
    console.error(`[mail] notice "${subject}": ${error.message}`)
  })
  waitUntil(sending)
  return sending
}
