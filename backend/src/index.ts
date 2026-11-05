import { createApp } from "./app.js"
import { config } from "./config.js"
import { cardReady } from "./lib/billing.js"
import { reconcileCards, reconcileRefunds } from "./lib/cardRecovery.js"
import { mailConfigured } from "./lib/mailer.js"
import { sendDigests } from "./lib/digest.js"
import { sendReminders } from "./lib/reminders.js"
import { refreshViews } from "./lib/snsPosts.js"
import { loadDatabase } from "./store.js"

await loadDatabase()

// 사흘 안으로 다가온 행사의 알림을 지금 보내고 이후 한 시간마다 보내며,
// 월요일에는 주간 요약도 보낸다(회원마다 한 번씩). 승인이나 환불이 기록되지 않은 카드
// 결제도 같은 시각에 정리한다.
const remind = () => {
  if (cardReady()) reconcileCards().then(reconcileRefunds).catch((error: Error) => console.error(`[billing] ${error.message}`))
  sendReminders().catch((error: Error) => console.error(`[reminders] ${error.message}`))
  sendDigests().catch((error: Error) => console.error(`[digests] ${error.message}`))
  refreshViews().catch((error: Error) => console.error(`[youtube] ${error.message}`))
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

// "true"는 X-Forwarded-For 항목을 모두 믿는데 호출한 쪽이 이를 마음대로 쓸 수
// 있으므로, 주소별 제한(로그인, 코드, 직원 PIN)을 피해 갈 수 있다.
if (config.trustProxy === true) {
  console.warn(
    "TRUST_PROXY=true trusts addresses the caller can forge. Set the number of proxies in front (usually 1) or their addresses instead.",
  )
}

createApp().listen(config.port, () => {
  console.log(`uniconnect API → http://localhost:${config.port}/api`)
})
