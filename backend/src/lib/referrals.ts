import { randomBytes, randomUUID } from "node:crypto"

import { acceptedProposal, type AcceptedProposal } from "./agreements.js"
import { grantPartners } from "./adminTools.js"
import { HttpError } from "./errors.js"
import { feeOf, feeState } from "./fees.js"
import { notify } from "./notices.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Agreement, Database, ReferralReward } from "../types.js"

// 브랜드가 자기 링크로 가입해 협찬까지 이어진 계정마다 운영자 승인을 거쳐 받는
// 캠퍼스 파트너스 일수. 학생 단체는 무료로 쓰므로 단체의 것은 세기만 한다.
export const referralRewardDays = 30

// 보상받는 협찬의 조건. 협찬액이 이만큼이고 수수료를 실제로 냈어야 한다. 본인
// 계정끼리 적은 금액으로 파트너스를 얻지 못하게 하려는 것이다.
export const referralMinValue = 300_000
// 한 사람이 한 해에 받을 수 있는 보상 수.
export const referralRewardsPerYear = 3

// 어느 화면에서나 똑같이 읽히는 글자. 0/O, 1/I/L은 뺀다.
const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// 계정의 초대 코드. 처음 요청할 때 만든다.
export function referralCodeOf(database: Database, account: Account) {
  if (account.referralCode) return account.referralCode
  let code = ""
  do {
    code = [...randomBytes(8)].map((byte) => letters[byte % letters.length]).join("")
  } while (database.accounts.some((item) => item.referralCode === code))
  account.referralCode = code
  return code
}

// 코드를 가진 회원. 데모 계정이나 정지된 계정은 제외한다.
export function referrerOf(database: Database, code: unknown) {
  if (typeof code !== "string" || !/^[A-Z0-9]{8}$/.test(code)) return undefined
  const account = database.accounts.find((item) => item.referralCode === code)
  return account && !isDemoAccount(database, account) && !account.suspendedAt ? account : undefined
}

// 보상 기록. 초대받은 계정이 지워져도 남아 한 해 상한이 줄지 않는다.
export const referralRewardsOf = (database: Database) => (database.referralRewards ??= [])

// 올해 받았거나 기다리는 보상 수. 거절된 것은 세지 않는다. 기록이 생기기 전에
// 지급된 보상은 계정의 시각으로 센다.
function rewardsThisYear(database: Database, referrerId: string, year: string) {
  const records = referralRewardsOf(database)
  const recorded = records.filter((item) => item.referrerId === referrerId && item.status !== "rejected" && item.createdAt.startsWith(year))
  const older = database.accounts.filter(
    (item) =>
      item.referredBy === referrerId &&
      item.referralRewardedAt?.startsWith(year) &&
      !records.some((record) => record.joinedId === item.id),
  )
  return recorded.length + older.length
}

// 협찬의 전자계약서를 양쪽이 확인하면(브랜드는 수수료를 낸 뒤) 누군가의
// 링크로 가입했고 아직 협찬이 없던 쪽마다 보상 기록을 한 번 만든다. 조건에
// 못 미치는 협찬은 넘어가고 다음 협찬이 다시 기회를 얻는다. 초대한 계정
// 자신과의 협찬에는 보상이 없다. 파트너스 일수는 운영자가 승인해야 나가므로
// 수수료를 내서 파트너스를 사는 길이 되지 않는다. 일수가 없는 학생단체의 것만
// 돌려주어 바로 알린다.
export function rewardReferrals(
  database: Database,
  { agreement, proposal }: { agreement: Agreement; proposal: AcceptedProposal },
  now = new Date(),
) {
  const accounts = [proposal.group.account, proposal.brand.account]
  const fee = feeState(database, agreement, proposal)
  const value = agreement.value?.cash === undefined ? 0 : agreement.value.cash + agreement.value.inKind
  if (fee.exempt || value < referralMinValue || fee.paid < feeOf({ cash: referralMinValue, inKind: 0 })) return []
  const year = now.toISOString().slice(0, 4)
  const told: { referrer: Account; joined: Account; days: number }[] = []
  for (const [index, joined] of accounts.entries()) {
    if (!joined?.referredBy || joined.referralRewardedAt) continue
    if (accounts[1 - index]?.id === joined.referredBy) continue
    if (rewardsThisYear(database, joined.referredBy, year) >= referralRewardsPerYear) continue
    joined.referralRewardedAt = now.toISOString()
    const referrer = database.accounts.find((item) => item.id === joined.referredBy)
    if (!referrer || referrer.suspendedAt) continue
    const days = referrer.role === "브랜드" ? referralRewardDays : 0
    referralRewardsOf(database).push({
      id: randomUUID(),
      referrerId: referrer.id,
      joinedId: joined.id,
      proposalId: agreement.id,
      days,
      status: days ? "waiting" : "approved",
      createdAt: now.toISOString(),
      ...(days ? {} : { decidedAt: now.toISOString() }),
    })
    if (!days) told.push({ referrer, joined, days })
  }
  return told
}

// 운영자가 판단하는 데 필요한 것. 지급을 막는 사유가 있으면 blocked에 담는다.
function reviewOf(database: Database, reward: ReferralReward) {
  const referrer = database.accounts.find((item) => item.id === reward.referrerId)
  const joined = database.accounts.find((item) => item.id === reward.joinedId)
  const proposal = acceptedProposal(database, reward.proposalId)
  const agreement = database.agreements.find((item) => item.id === reward.proposalId)
  const paid = proposal && agreement ? feeState(database, agreement, proposal).paid : 0
  const value = agreement?.value ? (agreement.value.cash ?? 0) + agreement.value.inKind : 0
  const blocked = !referrer || !joined
    ? "missing"
    : referrer.suspendedAt || joined.suspendedAt
      ? "suspended"
      : !proposal || proposal.canceled
        ? "canceled"
        : paid < feeOf({ cash: referralMinValue, inKind: 0 })
          ? "refunded"
          : undefined
  return { referrer, joined, paid, value, blocked }
}

// 콘솔에 보이는, 결정을 기다리는 보상. 오래된 것부터다.
export function waitingReferralRewards(database: Database) {
  return referralRewardsOf(database)
    .filter((reward) => reward.status === "waiting")
    .map((reward) => {
      const { referrer, joined, paid, value, blocked } = reviewOf(database, reward)
      return {
        id: reward.id,
        createdAt: reward.createdAt,
        days: reward.days,
        proposalId: reward.proposalId,
        referrer: referrer ? { id: referrer.id, name: referrer.name, business: Boolean(referrer.business) } : null,
        joined: joined ? { id: joined.id, name: joined.name, business: Boolean(joined.business), createdAt: joined.createdAt } : null,
        value,
        feePaid: paid,
        blocked: blocked ?? null,
      }
    })
}

// 승인하면 파트너스 일수를 주고 초대자에게 알릴 것을 돌려준다.
export function approveReferralReward(database: Database, reward: ReferralReward, now = new Date()) {
  const { referrer, joined, blocked } = reviewOf(database, reward)
  if (blocked || !referrer || !joined) throw new HttpError(409, "지급 조건이 달라져 승인할 수 없어요. 거절해 주세요.")
  grantPartners(database, referrer, reward.days, now, "친구 초대 보상")
  reward.status = "approved"
  reward.decidedAt = now.toISOString()
  return { referrer, joined, days: reward.days }
}

// 거절하면 지급하지 않는다. 그 초대로 다시 보상받지는 못한다.
export function rejectReferralReward(reward: ReferralReward, now = new Date()) {
  reward.status = "rejected"
  reward.decidedAt = now.toISOString()
}

// 탈퇴: 초대한 쪽의 기록은 지운다. 초대받은 쪽이 떠나면 기다리는 것은 없애고,
// 끝난 기록은 상한을 위해 계정 id만 비워 남긴다.
export function forgetReferralRewards(database: Database, accountId: string) {
  database.referralRewards = referralRewardsOf(database)
    .filter((item) => item.referrerId !== accountId && !(item.joinedId === accountId && item.status === "waiting"))
    .map((item) => {
      if (item.joinedId !== accountId) return item
      const { joinedId: _joinedId, ...rest } = item
      return rest
    })
}

// 내 정보에 보이는 것: 코드, 그것으로 가입한 수, 보상받은 수, 운영자 확인을
// 기다리는 수.
export function referralStats(database: Database, account: Account) {
  const joined = database.accounts.filter((item) => item.referredBy === account.id)
  return {
    code: referralCodeOf(database, account),
    joined: joined.length,
    rewarded: joined.filter((item) => item.referralRewardedAt && !referralRewardsOf(database).some((record) => record.joinedId === item.id && record.status !== "approved")).length,
    waiting: referralRewardsOf(database).filter((item) => item.referrerId === account.id && item.status === "waiting").length,
    rewardDays: account.role === "브랜드" ? referralRewardDays : 0,
  }
}

// 보상이 확정되어 저장되면 초대자마다 이메일을 보낸다.
export function tellReferrers(rewarded: ReturnType<typeof rewardReferrals>) {
  for (const { referrer, joined, days } of rewarded) {
    void notify(
      referrer,
      "account",
      "초대한 회원의 첫 협찬이 성사됐어요",
      [
        `초대 링크로 가입한 ${joined.name}의 첫 협찬이 성사됐어요.`,
        days ? `고마운 마음으로 캠퍼스 파트너스 ${days}일을 더해 드렸어요.` : "초대해 주셔서 고마워요.",
      ],
      "/me",
    )
  }
}
