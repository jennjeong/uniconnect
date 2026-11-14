import { randomUUID } from "node:crypto"
import { Router } from "express"

import { findListing, listingOwner, partnerCatalogOf, shownTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount, reviewKey } from "../lib/reviews.js"
import { reportReasons, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { AbuseReport, Account, ChatSide, Database } from "../types.js"

export const reportsRouter = Router()
export const blocksRouter = Router()

// 한 시간에 누구나 신고하는 횟수보다 많은 수다.
const reportsPerHour = createRateLimit({
  label: "신고 접수",
  limit: 20,
  windowMs: 60 * 60 * 1000,
  message: "신고를 너무 많이 보냈어요. 1시간 뒤에 다시 보내 주세요.",
})

// 신고 대상을 요청에서 찾는다. 리스팅으로 찾는 계정(신고자에게 보이는
// 것), 신고자 자신의 대화에서 상대편이 보낸 메시지, 후기나 그 답글(후기의
// 공개 키로 찾는다) 중 하나다. 대상이 되는 계정과 지금 시점의 신고된 글을
// 돌려준다.
function reportedThing(database: Database, account: Account, body: Record<string, unknown> | undefined) {
  const kind = text(body?.kind)
  if (kind === "account") {
    const catalog = partnerCatalogOf(account.role)
    const listing = database[catalog].find((item) => item.id === text(body?.listingId))
    if (!listing || !shownTo(database, catalog, listing, account)) throw new HttpError(404, "신고할 상대를 찾을 수 없어요.")
    return { accountId: listingOwner(database, listing.id)?.id, target: { kind } as AbuseReport["target"] }
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
      accountId: listingOwner(database, side === "group" ? conversation.brandId : conversation.groupId)?.id,
      target: { kind, conversationId: conversation.id, messageId: message.id } as AbuseReport["target"],
      // 파일은 보낼 때의 이름으로 보인다.
      excerpt: message.deletedAt ? undefined : message.text || message.attachment?.name,
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
      // 답글의 작성자는 후기가 가리키는 리스팅 뒤의 계정이다.
      accountId: listingOwner(database, review.aboutId)?.id,
      target: { kind, reviewId: review.id } as AbuseReport["target"],
      excerpt: review.reply.text,
    }
  }
  throw new HttpError(400, "무엇을 신고하는지 알 수 없어요.")
}

// 회원이 계정, 그 계정이 받은 메시지 하나, 또는 후기를 이유와 함께 신고한다.
// 운영자는 /admin에서 신고를 본다. 같은 대상의 신고는 한 번에 하나만 대기한다.
// 데모를 써 보는 모두가 공유하는 데모 계정은 신고할 수 없다.
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
  // 예시와 시드 후기에는 책임질 계정이 없다.
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
  await reportsPerHour.take(account.id)
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

// 이 계정에 보이는 리스팅 뒤의 계정을 차단한다. 그때부터 두 계정은 서로의
// 리스팅, 제안, 대화를 양쪽 모두 보지 못하며 차단을 풀 때까지 계속된다.
// 이미 확정된 협찬은 그대로 진행한다.
blocksRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 차단할 수 없어요.")
  const catalog = partnerCatalogOf(account.role)
  const listing = database[catalog].find((item) => item.id === text(req.body?.listingId))
  const other = listing && shownTo(database, catalog, listing, account) ? listingOwner(database, listing.id) : undefined
  if (!other) throw new HttpError(404, "차단할 상대를 찾을 수 없어요.")
  const blocked = (database.blocks[account.id] ??= [])
  if (!blocked.includes(other.id)) blocked.push(other.id)
  await saveDatabase()
  res.status(201).json({ ok: true })
})

blocksRouter.delete("/:listingId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const other = listingOwner(database, String(req.params.listingId))
  const blocked = database.blocks[account.id] ?? []
  if (!other || !blocked.includes(other.id)) throw new HttpError(404, "차단한 상대가 아니에요.")
  const left = blocked.filter((id) => id !== other.id)
  if (left.length > 0) database.blocks[account.id] = left
  else delete database.blocks[account.id]
  await saveDatabase()
  res.status(204).end()
})
