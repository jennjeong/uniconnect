import { randomUUID } from "node:crypto"
import { Router } from "express"

import { findListing, shownTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount, reviewKey } from "../lib/reviews.js"
import { reportReasons, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { AbuseReport, Account, ChatSide, Database } from "../types.js"

export const reportsRouter = Router()
export const blocksRouter = Router()

// The catalog of the side an account meets: brands for student groups.
const partnerCatalog = (account: Account) => (account.role === "학생단체" ? "brands" : "groups")

// The account behind a listing, when it has one (the examples have none).
const ownerOfListing = (database: Database, listingId: string) =>
  database.accounts.find((account) => account.groupId === listingId || account.brandId === listingId)

// More than anyone reports in an hour.
const reportsPerHour = createRateLimit({
  limit: 20,
  windowMs: 60 * 60 * 1000,
  message: "신고를 너무 많이 보냈어요. 1시간 뒤에 다시 보내 주세요.",
})

// What a report is about, from the request: an account by its listing (one
// the reporter sees), a message the other side of the reporter's own
// conversation sent, or a review or the reply to it by the review's public key. Answers the account it
// is about and the reported text as it is now.
function reportedThing(database: Database, account: Account, body: Record<string, unknown> | undefined) {
  const kind = text(body?.kind)
  if (kind === "account") {
    const catalog = partnerCatalog(account)
    const listing = database[catalog].find((item) => item.id === text(body?.listingId))
    if (!listing || !shownTo(database, catalog, listing, account)) throw new HttpError(404, "신고할 상대를 찾을 수 없어요.")
    return { accountId: ownerOfListing(database, listing.id)?.id, target: { kind } as AbuseReport["target"] }
  }
  if (kind === "message") {
    const side: ChatSide = account.role === "학생단체" ? "group" : "brand"
    const listing = findListing(database, account)
    const conversation = database.conversations.find((item) => item.id === text(body?.conversationId))
    const message = conversation?.messages.find((item) => item.id === text(body?.messageId))
    if (!listing || !conversation || conversation[`${side}Id`] !== listing.id || !message || message.from === side) {
      throw new HttpError(404, "신고할 메시지를 찾을 수 없어요.")
    }
    return {
      accountId: ownerOfListing(database, side === "group" ? conversation.brandId : conversation.groupId)?.id,
      target: { kind, conversationId: conversation.id, messageId: message.id } as AbuseReport["target"],
      excerpt: message.deletedAt ? undefined : message.text,
    }
  }
  if (kind === "review") {
    const review = database.reviews.find((item) => !item.hiddenAt && reviewKey(item) === text(body?.reviewKey))
    if (!review) throw new HttpError(404, "신고할 후기를 찾을 수 없어요.")
    return {
      accountId: review.authorAccountId,
      target: { kind, reviewId: review.id } as AbuseReport["target"],
      excerpt: review.comment || undefined,
    }
  }
  if (kind === "reply") {
    const review = database.reviews.find(
      (item) => !item.hiddenAt && item.reply && !item.reply.hiddenAt && reviewKey(item) === text(body?.reviewKey),
    )
    if (!review?.reply) throw new HttpError(404, "신고할 답글을 찾을 수 없어요.")
    return {
      // The reply's author: the account behind the listing the review is about.
      accountId: ownerOfListing(database, review.aboutId)?.id,
      target: { kind, reviewId: review.id } as AbuseReport["target"],
      excerpt: review.reply.text,
    }
  }
  throw new HttpError(400, "무엇을 신고하는지 알 수 없어요.")
}

// A member reports an account, one of the messages it was sent or a review,
// saying why; the operators see it on /admin. One report of a thing waits
// for them at a time. The shared demo accounts can't report, as everyone
// trying the demo uses them.
reportsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 신고할 수 없어요.")
  const reason = text(req.body?.reason)
  const detail = text(req.body?.detail)
  if (!reportReasons.includes(reason)) throw new HttpError(400, "신고 사유를 골라 주세요.")
  if (reason === "기타" && !detail) throw new HttpError(400, "어떤 일인지 적어 주세요.")
  if (detail.length > 300) throw new HttpError(400, "설명은 300자 이하로 적어 주세요.")
  const { accountId, target, excerpt } = reportedThing(database, account, req.body)
  // The examples and the seeded reviews have no account to answer for them.
  if (!accountId) throw new HttpError(409, "계정이 없는 상대라 신고할 수 없어요.")
  if (accountId === account.id) throw new HttpError(400, "내 계정은 신고할 수 없어요.")
  const waiting = database.reports.some(
    (report) =>
      report.reporterId === account.id &&
      !report.resolution &&
      report.accountId === accountId &&
      JSON.stringify(report.target) === JSON.stringify(target),
  )
  if (waiting) throw new HttpError(409, "이미 신고했어요. 운영자가 확인하고 있어요.")
  reportsPerHour.take(account.id)
  database.reports.push({
    id: randomUUID(),
    reporterId: account.id,
    accountId,
    target,
    reason,
    detail,
    ...(excerpt ? { excerpt } : {}),
    createdAt: new Date().toISOString(),
  })
  await saveDatabase()
  res.status(201).json({ ok: true })
})

// The accounts this account blocked, as their listings, to unblock from 내 정보.
blocksRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const blocked = (database.blocks[account.id] ?? []).flatMap((id) => {
    const other = database.accounts.find((item) => item.id === id)
    const listingId = other?.groupId ?? other?.brandId
    if (!other || !listingId) return []
    const listing = [...database.brands, ...database.groups].find((item) => item.id === listingId)
    return [{ listingId, name: listing?.name ?? other.name }]
  })
  res.json({ blocked })
})

// Blocks the account behind a listing this account sees. From then on the
// two don't see each other's listings, proposals or conversations, either
// way, until it is unblocked; sponsorships already confirmed go on.
blocksRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 차단할 수 없어요.")
  const catalog = partnerCatalog(account)
  const listing = database[catalog].find((item) => item.id === text(req.body?.listingId))
  const other = listing && shownTo(database, catalog, listing, account) ? ownerOfListing(database, listing.id) : undefined
  if (!other) throw new HttpError(404, "차단할 상대를 찾을 수 없어요.")
  const blocked = (database.blocks[account.id] ??= [])
  if (!blocked.includes(other.id)) blocked.push(other.id)
  await saveDatabase()
  res.status(201).json({ ok: true })
})

blocksRouter.delete("/:listingId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const other = ownerOfListing(database, String(req.params.listingId))
  const blocked = database.blocks[account.id] ?? []
  if (!other || !blocked.includes(other.id)) throw new HttpError(404, "차단한 상대가 아니에요.")
  const left = blocked.filter((id) => id !== other.id)
  if (left.length > 0) database.blocks[account.id] = left
  else delete database.blocks[account.id]
  await saveDatabase()
  res.status(204).end()
})
