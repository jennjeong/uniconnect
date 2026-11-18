import { sell } from "./billing.js"
import { HttpError } from "./errors.js"

// 협찬 수수료(lib/billing.ts의 "fee")는 더 이상 받지 않는다. 브랜드는 결제 없이 계약서를
// 확인한다(routes/agreements.ts). 새 주문은 받지 않는다. 그 전에 받은 결제는 기록으로 남고
// 운영자가 입금 확인과 환불을 처리할 수 있지만, 계약서 확인은 결제와 상관없으므로 결제나
// 환불이 확인을 바꾸지 않는다(브랜드는 지금의 조건을 보고 스스로 확인한다). 결제 기록은
// 전자상거래법에 따라 5년 남는다(lib/paymentRetention.ts).
sell("fee", {
  quote() {
    throw new HttpError(410, "협찬 수수료는 더 이상 받지 않아요. 결제 없이 계약서를 확인할 수 있어요.")
  },
})
