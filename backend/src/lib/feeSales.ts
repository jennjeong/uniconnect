import { acceptedProposal, agreementFor, confirmAgreement } from "./agreements.js"
import { sell } from "./billing.js"
import { HttpError } from "./errors.js"
import { notify } from "./notices.js"
import { rewardReferrals, tellReferrers } from "./referrals.js"

// 협찬 수수료(lib/billing.ts의 "fee")는 더 이상 받지 않는다. 브랜드는 결제 없이 계약서를
// 확인한다(routes/agreements.ts). 새 주문은 받지 않고, 그 전에 받은 결제가 남아 있으므로
// 기다리던 계좌이체를 운영자가 확인하는 경우(fulfil)와 환불(revoke)만 다룬다. 결제 기록은
// 전자상거래법에 따라 5년 남는다(lib/paymentRetention.ts).
sell("fee", {
  quote() {
    throw new HttpError(410, "협찬 수수료는 더 이상 받지 않아요. 결제 없이 계약서를 확인할 수 있어요.")
  },
  // 결제됨: 브랜드의 확인이 되고 단체가 이를 알게 된다.
  fulfil(database, payment) {
    const proposal = acceptedProposal(database, payment.targetId)
    if (!proposal || proposal.canceled) return
    const { agreement } = agreementFor(database, proposal)
    if (agreement.confirmed.brand) return
    const both = confirmAgreement(database, agreement, proposal, "brand")
    if (both) tellReferrers(rewardReferrals(database, { agreement, proposal }))
    void notify(
      proposal.group.account,
      "sponsorships",
      both ? "임시 전자 계약서를 양쪽 모두 확인했어요" : "임시 전자 계약서를 확인해 주세요",
      [`${proposal.brand.name}에서 '${proposal.eventName}' 임시 전자 계약서를 확인했어요.`],
      `/agreements/${encodeURIComponent(agreement.id)}`,
    )
  },
  // 환불됨: 그 결제로 이뤄진 브랜드의 확인을 거둔다.
  revoke(database, payment) {
    const agreement = database.agreements.find((item) => item.id === payment.targetId)
    if (agreement) delete agreement.confirmed.brand
  },
})
