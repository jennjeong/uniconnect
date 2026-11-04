import { Router, type Request } from "express"

import { acceptedProposal, sideIn } from "../lib/agreements.js"
import { findListing } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { agreementHeld, isDemoAccount, publicReview, reviewOpen, reviewsAbout, reviewSummary, reviewTarget } from "../lib/reviews.js"
import { reviewTags, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { ChatSide, Review } from "../types.js"

export const reviewsRouter = Router()

// 주소가 가리키는 수락된 제안을 두 쪽 중 한쪽의 입장에서 가져온다.
function sponsorship(req: Request) {
  const account = requireAccount(req)
  const database = getDatabase()
  const proposal = acceptedProposal(database, String(req.params.proposalId))
  const side = proposal && sideIn(proposal, account)
  if (!proposal || !side) throw new HttpError(404, "후기를 쓸 협찬을 찾을 수 없어요.")
  return { account, database, proposal, side, id: `${proposal.id}:${side}` }
}

// 누구나 볼 수 있는 한 리스팅의 후기다. 요약과 최근 20건을 담는다.
reviewsRouter.get("/", (req, res) => {
  const reviews = reviewsAbout(getDatabase(), String(req.query.about ?? ""))
  res.json({ summary: reviewSummary(reviews), reviews: reviews.slice(0, 20).map(publicReview) })
})

// 한쪽이 행사일부터 상대편에 대한 후기를 쓴다(다시 쓸 수도 있다). 새 후기가
// 달리면 상대편이 알림을 받는다.
reviewsRouter.put("/:proposalId", async (req, res) => {
  const { account, database, proposal, side, id } = sponsorship(req)
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 후기를 쓸 수 없어요.")
  if (proposal.canceled) throw new HttpError(409, "취소된 협찬에는 후기를 남길 수 없어요.")
  if (!reviewOpen(proposal)) throw new HttpError(409, "행사 날부터 후기를 쓸 수 있어요.")
  // e-contract에서 양쪽이 확정한 협찬만 쓸 수 있다(브랜드는 수수료를 낸
  // 뒤여야 한다). 성사되지 않은 계약으로 두 계정이 서로 후기를 주고받지
  // 못하게 하려는 것이다.
  if (!agreementHeld(database, proposal)) {
    throw new HttpError(409, "양쪽이 임시 전자 계약서를 확인한 협찬에만 후기를 남길 수 있어요.")
  }
  const aboutId = reviewTarget(proposal, side)
  const listings = side === "group" ? database.brands : database.groups
  if (!aboutId || !listings.some((listing) => listing.id === aboutId)) {
    throw new HttpError(409, "상대의 소개가 아직 없어서 후기를 남길 수 없어요.")
  }
  const rating = Number(req.body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "별점을 1부터 5까지 골라 주세요.")
  const picked = req.body?.tags ?? []
  if (!Array.isArray(picked)) throw new HttpError(400, "고를 수 없는 태그예요.")
  const tags = [...new Set(picked.map(text))]
  if (tags.length > 3) throw new HttpError(400, "태그는 3개까지 고를 수 있어요.")
  const allowed = reviewTags[side === "group" ? "브랜드" : "학생단체"]
  if (tags.some((tag) => !allowed.includes(tag))) throw new HttpError(400, "고를 수 없는 태그예요.")
  const comment = text(req.body?.comment)
  if (comment.length > 300) throw new HttpError(400, "후기는 300자 이하로 적어 주세요.")

  const existing = database.reviews.find((review) => review.id === id)
  const now = new Date().toISOString()
  const review: Review = {
    id,
    proposalId: proposal.id,
    side,
    aboutId,
    authorAccountId: account.id,
    authorName: findListing(database, account)?.name ?? account.name,
    eventName: proposal.eventName,
    rating,
    tags,
    comment,
    createdAt: existing?.createdAt ?? now,
    ...(existing ? { updatedAt: now } : {}),
    // 운영자가 내린 후기는 다시 써도 내려진 채로 있고, 상대편의 답글도
    // 함께 남는다.
    ...(existing?.hiddenAt ? { hiddenAt: existing.hiddenAt } : {}),
    ...(existing?.reply ? { reply: existing.reply } : {}),
  }
  database.reviews = [...database.reviews.filter((item) => item.id !== id), review]
  await saveDatabase()
  if (!existing) {
    void notify(
      (side === "group" ? proposal.brand : proposal.group).account,
      "sponsorships",
      "새 협찬 후기가 올라왔어요",
      [`${review.authorName}에서 '${proposal.eventName}' 협찬 후기를 남겼어요.`],
      `/agreements/${encodeURIComponent(proposal.id)}`,
    )
  }
  res.status(existing ? 200 : 201).json({ review: publicReview(review) })
})

reviewsRouter.delete("/:proposalId", async (req, res) => {
  const { database, id } = sponsorship(req)
  if (!database.reviews.some((review) => review.id === id)) throw new HttpError(404, "지울 후기가 없어요.")
  database.reviews = database.reviews.filter((review) => review.id !== id)
  await saveDatabase()
  res.status(204).end()
})

// 상대편이 이쪽의 역할에 대해 쓴 후기다. 이쪽에서 이 후기에 답할 수
// 있다.
function reviewOfMe(req: Request) {
  const found = sponsorship(req)
  const other: ChatSide = found.side === "group" ? "brand" : "group"
  return { ...found, other, review: found.database.reviews.find((item) => item.id === `${found.proposal.id}:${other}`) }
}

// 후기를 받은 쪽이 계약서에서 받은 후기에 한 번 답한다(다시 쓰면 바뀐다).
// 후기를 쓴 쪽은 새 답글을 알림으로 받는다. 운영자가 내린 후기에는 답할 수
// 없고, 공유 데모 계정도 답할 수 없다.
reviewsRouter.put("/:proposalId/reply", async (req, res) => {
  const { account, database, proposal, side, other, review } = reviewOfMe(req)
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 답글을 달 수 없어요.")
  if (!review) throw new HttpError(404, "답글을 달 후기가 없어요.")
  if (review.hiddenAt) throw new HttpError(409, "운영자가 내린 후기에는 답글을 달 수 없어요.")
  const reply = text(req.body?.text)
  if (!reply) throw new HttpError(400, "답글을 적어 주세요.")
  if (reply.length > 300) throw new HttpError(400, "답글은 300자 이하로 적어 주세요.")
  const before = review.reply
  const now = new Date().toISOString()
  review.reply = {
    text: reply,
    createdAt: before?.createdAt ?? now,
    ...(before ? { updatedAt: now } : {}),
    // 운영자가 내린 답글은 다시 써도 내려진 채로 있다.
    ...(before?.hiddenAt ? { hiddenAt: before.hiddenAt } : {}),
  }
  await saveDatabase()
  if (!before) {
    void notify(
      proposal[other].account,
      "sponsorships",
      "후기에 답글이 달렸어요",
      [`${proposal[side].name}에서 '${proposal.eventName}' 협찬 후기에 답글을 남겼어요.`],
      `/agreements/${encodeURIComponent(proposal.id)}`,
    )
  }
  res.status(before ? 200 : 201).json({ review: publicReview(review) })
})

reviewsRouter.delete("/:proposalId/reply", async (req, res) => {
  const { database, review } = reviewOfMe(req)
  if (!review?.reply) throw new HttpError(404, "지울 답글이 없어요.")
  delete review.reply
  await saveDatabase()
  res.status(204).end()
})
