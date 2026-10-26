import { randomUUID } from "node:crypto"
import { Router } from "express"

import { findListing, shownCatalog, shownTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { createRateLimit, senderKey } from "../lib/rateLimit.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, ChatSide, Conversation } from "../types.js"

export const conversationsRouter = Router()

const sideOf = (account: Account): ChatSide => (account.role === "학생단체" ? "group" : "brand")

// A message's text: required, up to 1,000 characters.
function messageText(value: unknown) {
  const message = text(value)
  if (!message) throw new HttpError(400, "메시지를 입력해 주세요.")
  if (message.length > 1000) throw new HttpError(400, "메시지는 1,000자 이하로 보내 주세요.")
  return message
}

// A conversation as one side sees it: the partner, the last message, unread
// count and, when asked, every message marked as its own or the partner's.
// Own messages say whether the partner has read them, and edited or deleted
// messages say so to both sides.
function view(conversation: Conversation, side: ChatSide, withMessages = false) {
  const database = getDatabase()
  const partnerId = side === "group" ? conversation.brandId : conversation.groupId
  const partner = (side === "group" ? database.brands : database.groups).find(
    (listing) => listing.id === partnerId,
  )
  const readAt = conversation.readAt[side] ?? ""
  const partnerReadAt = conversation.readAt[side === "group" ? "brand" : "group"] ?? ""
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
    lastMessage: last
      ? { text: last.text, at: last.at, mine: last.from === side, ...(last.deletedAt ? { deleted: true } : {}) }
      : null,
    // A message the sender deleted is not waiting to be read.
    unread: conversation.messages.filter(
      (message) => message.from !== side && message.at > readAt && !message.deletedAt,
    ).length,
    ...(withMessages
      ? {
          messages: conversation.messages.map((message) => ({
            id: message.id,
            text: message.text,
            at: message.at,
            mine: message.from === side,
            ...(message.from === side ? { read: message.at <= partnerReadAt } : {}),
            ...(message.editedAt ? { editedAt: message.editedAt } : {}),
            ...(message.deletedAt ? { deletedAt: message.deletedAt } : {}),
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

// A message this side sent in the conversation; only the sender may change it.
function findOwnMessage(conversation: Conversation, side: ChatSide, id: string) {
  const message = conversation.messages.find((item) => item.id === id)
  if (!message) throw new HttpError(404, "메시지를 찾을 수 없어요.")
  if (message.from !== side) throw new HttpError(403, "내가 보낸 메시지만 고치거나 지울 수 있어요.")
  return message
}

// The account's conversations, latest first. Visitors have none, and a
// member keeps none with the examples (from before they were set apart).
conversationsRouter.get("/", (req, res) => {
  const account = req.account
  const database = getDatabase()
  const listing = account ? findListing(database, account) : undefined
  if (!account || !listing) {
    res.json({ conversations: [] })
    return
  }
  const side = sideOf(account)
  const catalog = side === "group" ? "brands" : "groups"
  const partnerShown = (conversation: Conversation) => {
    const partner = database[catalog].find((item) => item.id === conversation[side === "group" ? "brandId" : "groupId"])
    return !partner || shownTo(database, catalog, partner, account)
  }
  const conversations = database.conversations
    .filter((conversation) => conversation[`${side}Id`] === listing.id && partnerShown(conversation))
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
  // Only a partner the account sees: members talk to members.
  const partners = shownCatalog(database, side === "group" ? "brands" : "groups", account)
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

// Faster than anyone types, and more than a day's talk: a flood, each of
// which may email the other side.
const messagesPerMinute = createRateLimit({
  limit: 20,
  windowMs: 60 * 1000,
  message: "메시지를 너무 빨리 보내고 있어요. 1분 뒤에 다시 보내 주세요.",
})
const messagesPerHour = createRateLimit({
  limit: 300,
  windowMs: 60 * 60 * 1000,
  message: "메시지를 너무 많이 보냈어요. 1시간 뒤에 다시 보내 주세요.",
})

conversationsRouter.post("/:id/messages", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const message = messageText(req.body?.text)
  const key = senderKey(req, getDatabase(), account)
  messagesPerMinute.check(key)
  messagesPerHour.take(key)
  messagesPerMinute.hit(key)
  const side = sideOf(account)
  const at = new Date().toISOString()
  // One email per run of unread messages: only when the other side had
  // read everything this side sent before.
  const other: ChatSide = side === "group" ? "brand" : "group"
  const waiting = conversation.messages.some(
    (item) => item.from === side && !item.deletedAt && item.at > (conversation.readAt[other] ?? ""),
  )
  conversation.messages.push({ id: randomUUID(), from: side, text: message, at })
  conversation.readAt[side] = at
  await saveDatabase()
  if (!waiting) {
    const partner = getDatabase().accounts.find((item) =>
      other === "brand" ? item.brandId === conversation.brandId : item.groupId === conversation.groupId,
    )
    void notify(partner, "새 메시지가 왔어요", [`${account.name}: ${message.slice(0, 80)}`], `/messages/${conversation.id}`)
  }
  res.status(201).json({ conversation: view(conversation, side, true) })
})

// Replaces the text of a message this side sent; both sides then see that
// it was edited. Deleted messages stay deleted.
conversationsRouter.put("/:id/messages/:messageId", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const message = findOwnMessage(conversation, side, req.params.messageId)
  if (message.deletedAt) throw new HttpError(409, "삭제한 메시지는 고칠 수 없어요.")
  const edited = messageText(req.body?.text)
  if (edited !== message.text) {
    message.text = edited
    message.editedAt = new Date().toISOString()
    await saveDatabase()
  }
  res.json({ conversation: view(conversation, side, true) })
})

// Deletes a message this side sent: its text is removed, and both sides see
// that a message was deleted where it stood.
conversationsRouter.delete("/:id/messages/:messageId", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const message = findOwnMessage(conversation, side, req.params.messageId)
  if (!message.deletedAt) {
    message.text = ""
    message.deletedAt = new Date().toISOString()
    delete message.editedAt
    await saveDatabase()
  }
  res.json({ conversation: view(conversation, side, true) })
})
