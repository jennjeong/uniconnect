import { Router, type Request } from "express"

import { acceptedProposal, sideIn } from "../lib/agreements.js"
import { findListing } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import {
  isDemoAccount,
  publicReview,
  reviewOpen,
  reviewSummary,
  reviewTarget,
  reviewsAbout,
} from "../lib/reviews.js"
import { reviewTags, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Review } from "../types.js"

export const reviewsRouter = Router()

// The accepted proposal behind the address, for one of its two sides.
function sponsorship(req: Request) {
  const account = requireAccount(req)
  const database = getDatabase()
  const proposal = acceptedProposal(database, String(req.params.proposalId))
  const side = proposal && sideIn(proposal, account)
  if (!proposal || !side) throw new HttpError(404, "후기를 쓸 협찬을 찾을 수 없어요.")
  return { account, database, proposal, side, id: `${proposal.id}:${side}` }
}

// A listing's reviews, for anyone: in short, then the latest 20.
reviewsRouter.get("/", (req, res) => {
  const reviews = reviewsAbout(getDatabase(), String(req.query.about ?? ""))
  res.json({ summary: reviewSummary(reviews), reviews: reviews.slice(0, 20).map(publicReview) })
})

// A side writes (or rewrites) its review of the other side, from the event's
// day on. The other side hears about a new one.
reviewsRouter.put("/:proposalId", async (req, res) => {
  const { account, database, proposal, side, id } = sponsorship(req)
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 후기를 쓸 수 없어요.")
  if (!reviewOpen(proposal)) throw new HttpError(409, "행사 날부터 후기를 쓸 수 있어요.")
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
  }
  database.reviews = [...database.reviews.filter((item) => item.id !== id), review]
  await saveDatabase()
  if (!existing) {
    void notify(
      (side === "group" ? proposal.brand : proposal.group).account,
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
