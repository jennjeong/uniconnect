import { createApp } from "./app.js"
import { config } from "./config.js"
import { mailConfigured } from "./lib/mailer.js"
import { loadDatabase } from "./store.js"

await loadDatabase()

if (config.isProduction && !config.exposeEmailCodes && !mailConfigured()) {
  console.warn(
    "No mail service: set RESEND_API_KEY and MAIL_FROM, or sign-up and password reset cannot get their codes.",
  )
}

if (config.isProduction && config.exposeEmailCodes) {
  console.warn(
    "EXPOSE_EMAIL_CODES=true: sign-up codes go back to the browser, so anyone can sign up with any email. Turn it off once mail is sent.",
  )
}

createApp().listen(config.port, () => {
  console.log(`uniconnect API → http://localhost:${config.port}/api`)
})
