import { waitUntil } from "@vercel/functions"

import { config } from "../config.js"
import { translate } from "./i18n.js"
import { sendMail } from "./mailer.js"
import { getDatabase } from "../store.js"
import type { Account, MailKind } from "../types.js"

// The shared demo accounts are never emailed: everyone trying the demo uses
// them, so their addresses stand for no one, and one is on a real
// university's domain. Nor are accounts the operators suspended.
const isDemo = (account: Account) => Object.values(getDatabase().demoAccountIds).includes(account.id)

// Tells an account by email that something waits for it: a proposal, an
// answer or a message, with a link to the page when SITE_URL is set. A kind
// the account turned off in 내 정보 doesn't go; "account" (its own login
// email, the operators' answers) always does. The email is in the language
// the account last used the app in: each line the server wrote in Korean
// goes through translate (i18n/en.ts, {name} patterns for the lines with a
// value). It never holds up or fails the request that caused it. On Vercel a
// function may stop once its answer is sent, so waitUntil keeps it running
// until the mail has gone; elsewhere that does nothing.
export function notify(
  account: Account | undefined,
  kind: MailKind | "account",
  subject: string,
  lines: string[],
  path: string,
) {
  if (!account || isDemo(account) || account.suspendedAt) return Promise.resolve()
  if (kind !== "account" && account.mailOff?.includes(kind)) return Promise.resolve()
  const say = (text: string) => translate(text, account.language ?? "ko")
  const site = config.siteUrl?.replace(/\/$/, "")
  const text = [
    ...lines.map(say),
    ...(site ? ["", `${say("바로 가기")}: ${site}${path}`] : []),
    // Where to turn this kind off.
    ...(site && kind !== "account" ? [`${say("받을 메일 바꾸기")}: ${site}/me`] : []),
    "",
    "uniconnect",
  ].join("\n")
  const sending = sendMail(account.email, `[uniconnect] ${say(subject)}`, text).catch((error: Error) => {
    console.error(`[mail] notice "${subject}": ${error.message}`)
  })
  waitUntil(sending)
  return sending
}
