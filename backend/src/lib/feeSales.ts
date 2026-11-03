import { acceptedProposal, agreementFor, confirmAgreement } from "./agreements.js"
import { sell } from "./billing.js"
import { HttpError } from "./errors.js"
import { feeState } from "./fees.js"
import { notify } from "./notices.js"
import { rewardReferrals, tellReferrers } from "./referrals.js"

// The fee as a product (lib/billing.ts): the brand's share of an accepted
// proposal's agreement, for what is still due; paying it confirms the
// agreement for the brand.
sell("fee", {
  quote(database, account, targetId) {
    const proposal = acceptedProposal(database, targetId)
    if (!proposal || proposal.canceled || proposal.brand.account?.id !== account.id) {
      throw new HttpError(404, "임시 전자 계약서를 찾을 수 없어요.")
    }
    const { agreement } = agreementFor(database, proposal)
    const fee = feeState(database, agreement, proposal)
    if (fee.needsValue) throw new HttpError(409, "협찬액(현금과 현물 환산)을 먼저 적어 주세요. 수수료는 그 금액으로 정해져요.")
    if (fee.due <= 0) throw new HttpError(409, "낼 수수료가 없어요.")
    return { amount: fee.due, orderName: `${proposal.eventName} 협찬 수수료`.slice(0, 100) }
  },
  // Paid: the brand's confirmation, and the group hears of it.
  fulfil(database, payment) {
    const proposal = acceptedProposal(database, payment.targetId)
    if (!proposal || proposal.canceled) return
    const { agreement } = agreementFor(database, proposal)
    if (feeState(database, agreement, proposal).due > 0) return
    const both = confirmAgreement(database, agreement, proposal, "brand")
    // Each side's first confirmed sponsorship rewards whoever invited it.
    if (both) tellReferrers(rewardReferrals(database, [proposal.group.account, proposal.brand.account]))
    void notify(
      proposal.group.account,
      "sponsorships",
      both ? "임시 전자 계약서를 양쪽 모두 확인했어요" : "임시 전자 계약서를 확인해 주세요",
      [`${proposal.brand.name}에서 '${proposal.eventName}' 임시 전자 계약서를 확인했어요.`],
      `/agreements/${encodeURIComponent(agreement.id)}`,
    )
  },
  // Refunded: the brand's confirmation is taken back.
  revoke(database, payment) {
    const agreement = database.agreements.find((item) => item.id === payment.targetId)
    if (agreement) delete agreement.confirmed.brand
  },
})
