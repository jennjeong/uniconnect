import { prices, sell } from "./billing.js"
import { HttpError } from "./errors.js"
import { reportOpen, sponsorshipFor } from "./premiumReport.js"

// The detailed report as a product (lib/billing.ts): one sponsorship's, from
// its event's day; paying unlocks it for good.
sell("report", {
  quote(database, account, targetId) {
    const found = sponsorshipFor(database, account, targetId)
    if (!found) throw new HttpError(404, "측정한 협찬을 찾을 수 없어요.")
    if (!reportOpen(found.event)) throw new HttpError(409, "상세 리포트는 행사 날부터 살 수 있어요.")
    return { amount: prices.report, orderName: `${found.event.name} 상세 성과 리포트`.slice(0, 100) }
  },
})
