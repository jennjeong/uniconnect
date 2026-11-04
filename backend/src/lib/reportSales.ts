import { prices, sell } from "./billing.js"
import { HttpError } from "./errors.js"
import { reportOpen, sponsorshipFor } from "./premiumReport.js"

// 상품으로서의 상세 리포트(lib/billing.ts): 협찬 하나의 것이며 행사 날부터
// 살 수 있고, 결제하면 영구히 열린다.
sell("report", {
  quote(database, account, targetId) {
    const found = sponsorshipFor(database, account, targetId)
    if (!found) throw new HttpError(404, "측정한 협찬을 찾을 수 없어요.")
    if (!reportOpen(found.event)) throw new HttpError(409, "상세 리포트는 행사 날부터 살 수 있어요.")
    return { amount: prices.report, orderName: `${found.event.name} 상세 성과 리포트`.slice(0, 100) }
  },
})
