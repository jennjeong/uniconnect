import { acceptedProposalsOf } from "./agreements.js"
import { todayInKorea } from "./dates.js"
import { statusOf } from "./proposals.js"
import type { Account, Database, SponsorOffer, SponsorRequest } from "../types.js"

// 단체 · 브랜드의 신뢰 지표다(#343). 프로필(카탈로그의 리스팅과 내 소개)에 보인다.
// - 응답률: 받은 제안 중 마감 전에 답한 비율. 마감은 행사가 지나거나 보낸 쪽이 적은 응답
//   기한(terms.respondBy)이 지난 때다. 아직 답할 수 있는 제안은 세지 않는다.
// - 이행률(브랜드만): 지급 예정일이 있는 현금 협찬 중 예정일까지 단체가 수령을 표시한
//   비율. 예정일이 지났거나 수령을 표시한 것만 센다. 취소된 협찬은 뺀다.
// 데모 계정과 데모 계정이 보낸 제안, 계정이 없는 시드 예시는 세지 않는다. 센 건수가
// trustMinimum보다 적으면 비율을 보내지 않는다(화면은 "아직 기록이 적어요"를 보인다).
export const trustMinimum = 3

export type TrustRate = { count: number; rate?: number }
export type TrustSignals = { response: TrustRate; fulfilment?: TrustRate }

const rateOf = (kept: number, count: number): TrustRate =>
  count >= trustMinimum ? { count, rate: Math.round((kept / count) * 100) } : { count }

const dayOf = (at: string) => todayInKorea(new Date(at))

// 리스팅 주인의 지표. 주인이 없거나 데모 계정이면 undefined다.
export function trustOf(database: Database, owner: Account | undefined, today = todayInKorea()): TrustSignals | undefined {
  const demo = new Set(Object.values(database.demoAccountIds))
  if (!owner || demo.has(owner.id)) return undefined
  const listingId = owner.role === "브랜드" ? owner.brandId : owner.groupId
  if (!listingId) return undefined
  const members = new Set(database.accounts.filter((account) => !demo.has(account.id)).map((account) => account.id))
  const received: (SponsorRequest | SponsorOffer)[] =
    owner.role === "브랜드"
      ? database.requests.filter((request) => request.brandId === listingId)
      : database.offers.filter((offer) => offer.groupId === listingId)
  let answered = 0
  let closed = 0
  for (const proposal of received) {
    if (!proposal.fromAccountId || !members.has(proposal.fromAccountId)) continue
    const respondBy = proposal.terms?.respondBy
    const inTime = Boolean(proposal.respondedAt) && (!respondBy || dayOf(proposal.respondedAt!) <= respondBy)
    const over = statusOf(database, proposal, today) === "마감" || Boolean(respondBy && respondBy < today)
    if (!proposal.respondedAt && !over) continue
    closed += 1
    if (inTime) answered += 1
  }
  const response = rateOf(answered, closed)
  if (owner.role !== "브랜드") return { response }
  let kept = 0
  let due = 0
  for (const proposal of acceptedProposalsOf(database, owner)) {
    if (proposal.canceled || proposal.brand.account?.id !== owner.id) continue
    const payout = database.agreements.find((agreement) => agreement.id === proposal.id)?.payout
    if (!payout?.dueDate) continue
    if (!payout.receivedAt && payout.dueDate >= today) continue
    due += 1
    if (payout.receivedAt && dayOf(payout.receivedAt) <= payout.dueDate) kept += 1
  }
  return { response, fulfilment: rateOf(kept, due) }
}
