import { randomUUID } from "node:crypto"
import { Router } from "express"

import { findListing } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, ChatSide, Conversation } from "../types.js"

export const conversationsRouter = Router()

const sideOf = (account: Account): ChatSide => (account.role === "학생단체" ? "group" : "brand")

// A conversation as one side sees it: the partner, the last message, unread
// count and, when asked, every message marked as its own or the partner's.
function view(conversation: Conversation, side: ChatSide, withMessages = false) {
  const database = getDatabase()
  const partnerId = side === "group" ? conversation.brandId : conversation.groupId
  const partner = (side === "group" ? database.brands : database.groups).find(
    (listing) => listing.id === partnerId,
  )
  const readAt = conversation.readAt[side] ?? ""
  const last = conversation.messages.at(-1)
  return {
    id: conversation.id,
    partner: {
      id: partnerId,
      name: partner?.name ?? "알 수 없는 상대",
      category: partner?.category ?? "",
      industry: partner?.industry ?? "cafe",
      ...(partner?.school ? { school: partner.school } : {}),
      // Messages reach partners who have an account.
      hasAccount: database.accounts.some(
        (account) => (side === "group" ? account.brandId : account.groupId) === partnerId,
      ),
    },
    lastMessage: last ? { text: last.text, at: last.at, mine: last.from === side } : null,
    unread: conversation.messages.filter((message) => message.from !== side && message.at > readAt)
      .length,
    ...(withMessages
      ? {
          messages: conversation.messages.map((message) => ({
            id: message.id,
            text: message.text,
            at: message.at,
            mine: message.from === side,
          })),
        }
      : {}),
  }
}

// The conversation `id` the account takes part in.
function findOwn(account: Account, id: string) {
  const listing = findListing(getDatabase(), account)
  const conversation = getDatabase().conversations.find((item) => item.id === id)
  const side = sideOf(account)
  if (!listing || !conversation || conversation[`${side}Id`] !== listing.id) {
    throw new HttpError(404, "대화를 찾을 수 없어요.")
  }
  return conversation
}

// The account's conversations, latest first. Visitors have none.
conversationsRouter.get("/", (req, res) => {
  const account = req.account
  const listing = account ? findListing(getDatabase(), account) : undefined
  if (!account || !listing) {
    res.json({ conversations: [] })
    return
  }
  const side = sideOf(account)
  const conversations = getDatabase()
    .conversations.filter((conversation) => conversation[`${side}Id`] === listing.id)
    .map((conversation) => view(conversation, side))
    .sort((a, b) => (b.lastMessage?.at ?? "").localeCompare(a.lastMessage?.at ?? ""))
  res.json({ conversations })
})

// Opens the conversation with a brand (for groups) or group (for brands),
// starting it the first time. The account needs its own listing first, so
// the partner can see who is asking.
conversationsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const listing = findListing(database, account)
  if (!listing) throw new HttpError(409, "먼저 내 정보에서 소개를 등록해 주세요.")
  const partnerId = text(req.body?.partnerId)
  const side = sideOf(account)
  const partners = side === "group" ? database.brands : database.groups
  if (!partners.some((partner) => partner.id === partnerId)) {
    throw new HttpError(404, "대화할 상대를 찾을 수 없어요.")
  }
  const groupId = side === "group" ? listing.id : partnerId
  const brandId = side === "brand" ? listing.id : partnerId
  let conversation = database.conversations.find(
    (item) => item.groupId === groupId && item.brandId === brandId,
  )
  if (!conversation) {
    conversation = { id: randomUUID(), groupId, brandId, messages: [], readAt: {} }
    database.conversations.push(conversation)
    await saveDatabase()
    res.status(201)
  }
  res.json({ conversation: view(conversation, side, true) })
})

// Every message; reading marks the conversation read for this side.
conversationsRouter.get("/:id", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const last = conversation.messages.at(-1)
  if (last && (conversation.readAt[side] ?? "") < last.at) {
    conversation.readAt[side] = last.at
    await saveDatabase()
  }
  res.json({ conversation: view(conversation, side, true) })
})

conversationsRouter.post("/:id/messages", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const message = text(req.body?.text)
  if (!message) throw new HttpError(400, "메시지를 입력해 주세요.")
  if (message.length > 1000) throw new HttpError(400, "메시지는 1,000자 이하로 보내 주세요.")
  const side = sideOf(account)
  const at = new Date().toISOString()
  conversation.messages.push({ id: randomUUID(), from: side, text: message, at })
  conversation.readAt[side] = at
  await saveDatabase()
  res.status(201).json({ conversation: view(conversation, side, true) })
})
