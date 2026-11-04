import { createHash } from "node:crypto"

import { todayInKorea } from "./dates.js"
import type { AcceptedProposal } from "./agreements.js"
import type { Account, ChatSide, Database, Review } from "../types.js"

// 후기는 행사 당일에 열린다(날짜가 없는 행사는 바로). 취소되지 않은
// 협찬에 한한다.
export const reviewOpen = (proposal: AcceptedProposal) =>
  !proposal.canceled && (!proposal.eventDate || proposal.eventDate <= todayInKorea())

// 한쪽의 후기가 가리키는 리스팅: 상대편의 것.
export const reviewTarget = (proposal: AcceptedProposal, side: ChatSide) =>
  (side === "group" ? proposal.brand : proposal.group).listingId

export const isDemoAccount = (database: Database, account: Account | undefined) =>
  account !== undefined && Object.values(database.demoAccountIds).includes(account.id)

// 양쪽이 협찬의 전자계약서를 확인했는지(브랜드는 수수료를 낸 뒤). 계정이
// 없는 상대는 확인할 수 없으므로 그때는 필요 없다.
export function agreementHeld(database: Database, proposal: AcceptedProposal) {
  if (!proposal.group.account || !proposal.brand.account) return true
  const agreement = database.agreements.find((item) => item.id === proposal.id)
  return Boolean(agreement?.confirmed.group && agreement.confirmed.brand)
}

// 한쪽이 지금 후기를 쓸 수 있는지: 공용 데모 계정이 아니고(후기는 모두에게
// 보인다), 그날이 왔고, 양쪽이 전자계약서를 확인했고, 상대편에 후기를 보여
// 줄 리스팅이 있어야 한다.
export function canReview(database: Database, proposal: AcceptedProposal, side: ChatSide) {
  const aboutId = reviewTarget(proposal, side)
  const listings = side === "group" ? database.brands : database.groups
  return (
    !isDemoAccount(database, proposal[side].account) &&
    reviewOpen(proposal) &&
    agreementHeld(database, proposal) &&
    aboutId !== undefined &&
    listings.some((listing) => listing.id === aboutId)
  )
}

// 리스팅의 후기. 운영자가 고정한 것을 먼저, 그다음 새것부터 두고 운영자가
// 내린 것은 뺀다.
export const reviewsAbout = (database: Database, listingId: string) =>
  database.reviews
    .filter((review) => review.aboutId === listingId && !review.hiddenAt)
    .sort((a, b) => Number(Boolean(b.pinnedAt)) - Number(Boolean(a.pinnedAt)) || b.createdAt.localeCompare(a.createdAt))

// 리스팅 후기의 요약: 건수, 소수 첫째 자리까지의 평균 별점, 태그별로 고른
// 수(많이 고른 순).
export function reviewSummary(reviews: Review[]) {
  const count = reviews.length
  const average = count ? Math.round((reviews.reduce((sum, review) => sum + review.rating, 0) / count) * 10) / 10 : 0
  const picked = new Map<string, number>()
  for (const review of reviews) for (const tag of review.tags) picked.set(tag, (picked.get(tag) ?? 0) + 1)
  const tags = [...picked]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag, times]) => ({ tag, count: times }))
  return { count, average, tags }
}

// 후기의 공개 이름. 제안을 드러내지 않고 후기를 가리켜 읽는 사람이 신고할
// 수 있게 한다.
export const reviewKey = (review: Review) => createHash("sha256").update(review.id).digest("hex").slice(0, 16)

// 누구에게나 보이는 후기: 제안이나 작성자 계정은 빼고 보인다. 작성자는
// 운영자가 내렸는지도 보고, 답글 작성자는 답글이 내려졌는지 본다(그때
// 본문은 뺀다).
export const publicReview = (review: Review) => ({
  key: reviewKey(review),
  authorName: review.authorName,
  side: review.side,
  eventName: review.eventName,
  rating: review.rating,
  tags: review.tags,
  comment: review.comment,
  createdAt: review.createdAt,
  ...(review.updatedAt ? { updatedAt: review.updatedAt } : {}),
  ...(review.hiddenAt ? { hidden: true } : {}),
  ...(review.reply
    ? {
        reply: review.reply.hiddenAt
          ? { hidden: true as const, createdAt: review.reply.createdAt }
          : {
              text: review.reply.text,
              createdAt: review.reply.createdAt,
              ...(review.reply.updatedAt ? { updatedAt: review.reply.updatedAt } : {}),
            },
      }
    : {}),
})
