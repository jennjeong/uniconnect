import { createHash } from "node:crypto"

import { todayInKorea } from "./dates.js"
import type { AcceptedProposal } from "./agreements.js"
import type { Account, ChatSide, Database, Review } from "../types.js"

// Reviews open on the event's own day (at once for one without a day), for
// a sponsorship that wasn't called off.
export const reviewOpen = (proposal: AcceptedProposal) =>
  !proposal.canceled && (!proposal.eventDate || proposal.eventDate <= todayInKorea())

// The listing a side's review is about: the other side's.
export const reviewTarget = (proposal: AcceptedProposal, side: ChatSide) =>
  (side === "group" ? proposal.brand : proposal.group).listingId

export const isDemoAccount = (database: Database, account: Account | undefined) =>
  account !== undefined && Object.values(database.demoAccountIds).includes(account.id)

// Whether a side may write its review now: it isn't a shared demo account
// (reviews show to everyone), the day has come, and the other side has a
// listing to show it on.
export function canReview(database: Database, proposal: AcceptedProposal, side: ChatSide) {
  const aboutId = reviewTarget(proposal, side)
  const listings = side === "group" ? database.brands : database.groups
  return (
    !isDemoAccount(database, proposal[side].account) &&
    reviewOpen(proposal) &&
    aboutId !== undefined &&
    listings.some((listing) => listing.id === aboutId)
  )
}

// A listing's reviews, newest first, without those the operators took down.
export const reviewsAbout = (database: Database, listingId: string) =>
  database.reviews
    .filter((review) => review.aboutId === listingId && !review.hiddenAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

// A listing's reviews in short: how many, the average stars to one decimal
// and how many picked each tag, the most picked first.
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

// A review's name in public, standing for it without giving its proposal
// away, so a reader can report it.
export const reviewKey = (review: Review) => createHash("sha256").update(review.id).digest("hex").slice(0, 16)

// What anyone sees of a review: not its proposal or the author's account.
// Its author also sees whether the operators took it down, and the reply's
// author whether they took the reply down (its text is left out then).
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
