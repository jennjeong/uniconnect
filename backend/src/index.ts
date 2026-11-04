import { createApp } from "./app.js"
import { config } from "./config.js"
import { cardReady } from "./lib/billing.js"
import { reconcileCards } from "./lib/cardRecovery.js"
import { mailConfigured } from "./lib/mailer.js"
import { sendDigests } from "./lib/digest.js"
import { sendReminders } from "./lib/reminders.js"
import { loadDatabase } from "./store.js"

await loadDatabase()

// Reminders of events three days away or nearer, now and every hour after,
// and on Mondays the weekly digests (each member's once); card payments
// whose approval wasn't recorded are settled on the same hour.
const remind = () => {
  if (cardReady()) reconcileCards().catch((error: Error) => console.error(`[billing] ${error.message}`))
  sendReminders().catch((error: Error) => console.error(`[reminders] ${error.message}`))
  sendDigests().catch((error: Error) => console.error(`[digests] ${error.message}`))
}
void remind()
setInterval(remind, 60 * 60 * 1000).unref()

if (config.isProduction && !config.exposeEmailCodes && !mailConfigured()) {
  console.warn(
    "No mail service: set RESEND_API_KEY and MAIL_FROM, or sign-up and password reset cannot get their codes.",
  )
}

if (config.isProduction && config.exposeEmailCodes) {
  console.warn(
    "EXPOSE_EMAIL_CODES=true: sign-up codes go back to the browser, so anyone can sign up with any email. Turn it off once mail is sent. (Password reset codes are never shown.)",
  )
}

// "true" trusts every X-Forwarded-For entry, which the caller can write
// itself, so per-address limits (login, codes, staff PIN) can be dodged.
if (config.trustProxy === true) {
  console.warn(
    "TRUST_PROXY=true trusts addresses the caller can forge. Set the number of proxies in front (usually 1) or their addresses instead.",
  )
}

createApp().listen(config.port, () => {
  console.log(`uniconnect API → http://localhost:${config.port}/api`)
})
