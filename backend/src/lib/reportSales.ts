import { sell } from "./billing.js"
import { HttpError } from "./errors.js"

// 상세 리포트(lib/billing.ts의 "report")는 더 이상 팔지 않는다. 협찬의 주인 브랜드는 행사 날부터
// 무료로 본다(lib/premiumReport.ts의 canReadReport). 그 전에 산 결제는 기록과 환불을 위해 남는다.
sell("report", {
  quote() {
    throw new HttpError(410, "상세 리포트는 이제 무료예요. 행사 날부터 바로 볼 수 있어요.")
  },
})
