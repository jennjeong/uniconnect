import { randomUUID } from "node:crypto"
import { Router } from "express"

import { findListing, shownCatalog, shownTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { chatFiles, fileName, parsePdf, parsePhoto, photoType, photos } from "../lib/photos.js"
import { createRateLimit, senderKey } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, ChatAttachment, ChatSide, Conversation, Database } from "../types.js"

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
      ? {
          text: last.text,
          at: last.at,
          mine: last.from === side,
          ...(last.deletedAt ? { deleted: true } : {}),
          ...(last.attachment ? { attachment: last.attachment.type } : {}),
        }
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
            ...(message.attachment ? { attachment: message.attachment } : {}),
          })),
        }
      : {}),
  }
}

// The conversation `id` the account takes part in, with a partner it still
// sees (not one either side blocked).
function findOwn(account: Account, id: string) {
  const database = getDatabase()
  const listing = findListing(database, account)
  const conversation = database.conversations.find((item) => item.id === id)
  const side = sideOf(account)
  const catalog = side === "group" ? "brands" : "groups"
  const partner =
    conversation && database[catalog].find((item) => item.id === conversation[side === "group" ? "brandId" : "groupId"])
  if (
    !listing ||
    !conversation ||
    conversation[`${side}Id`] !== listing.id ||
    (partner && !shownTo(database, catalog, partner, account))
  ) {
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

// Counts a message against the flood limits, before anything is kept.
function countMessage(req: Parameters<typeof senderKey>[0], account: Account) {
  const key = senderKey(req, getDatabase(), account)
  messagesPerMinute.check(key)
  messagesPerHour.take(key)
  messagesPerMinute.hit(key)
}

// Adds a message from this account's side and saves it. The other side is
// emailed once per run of unread messages: only when it had read
// everything this side sent before (`line` is what the email shows).
async function addMessage(
  account: Account,
  conversation: Conversation,
  entry: { text: string; attachment?: ChatAttachment },
  line: string,
) {
  const side = sideOf(account)
  const at = new Date().toISOString()
  const other: ChatSide = side === "group" ? "brand" : "group"
  const waiting = conversation.messages.some(
    (item) => item.from === side && !item.deletedAt && item.at > (conversation.readAt[other] ?? ""),
  )
  conversation.messages.push({ id: randomUUID(), from: side, at, ...entry })
  conversation.readAt[side] = at
  await saveDatabase()
  if (!waiting) {
    const partner = getDatabase().accounts.find((item) =>
      other === "brand" ? item.brandId === conversation.brandId : item.groupId === conversation.groupId,
    )
    void notify(partner, "messages", "새 메시지가 왔어요", [`${account.name}: ${line}`], `/messages/${conversation.id}`)
  }
}

conversationsRouter.post("/:id/messages", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const message = messageText(req.body?.text)
  countMessage(req, account)
  await addMessage(account, conversation, { text: message }, message.slice(0, 80))
  res.status(201).json({ conversation: view(conversation, sideOf(account), true) })
})

// Bytes of files one account keeps in its conversations, all told.
const maxStoredBytes = 10 * 1024 * 1024

// The bytes of the files this account's side sent and still keeps.
function storedBytes(database: Database, account: Account) {
  const listing = findListing(database, account)
  const side = sideOf(account)
  if (!listing) return 0
  return database.conversations
    .filter((conversation) => conversation[`${side}Id`] === listing.id)
    .flatMap((conversation) => conversation.messages)
    .reduce((sum, message) => sum + (message.from === side && message.attachment ? message.attachment.size : 0), 0)
}

// A file as a message of its own, without text: a photo the browser resized
// (PNG, JPG or WebP) or a PDF of 2 MB at most, kept with lib/photos.ts. Each
// account keeps 10 MB of files at most, and the shared demo accounts send
// none, as everyone trying them would see them. Its larger body gets a
// parser of its own in app.ts.
conversationsRouter.post("/:id/attachments", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  if (isDemoAccount(getDatabase(), account)) throw new HttpError(403, "데모 계정은 파일을 보낼 수 없어요.")
  // The name it was sent with, without folders or odd characters.
  const sentName = text(req.body?.name).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").slice(0, 80)
  const photo = parsePhoto(req.body?.file)
  const kept = photo ?? parsePdf(req.body?.file)
  if (!kept) throw new HttpError(400, "사진(PNG, JPG, WebP)이나 2MB 이하의 PDF를 보내 주세요.")
  if (storedBytes(getDatabase(), account) + kept.bytes.length > maxStoredBytes) {
    throw new HttpError(409, "보낸 파일이 10MB를 넘어요. 지난 파일 메시지를 지운 뒤 다시 보내 주세요.")
  }
  countMessage(req, account)
  const store = photos()
  await store.put(chatFiles(conversation.id), kept.name, kept.bytes)
  const type = photo ? "image" : "pdf"
  const name = sentName || (photo ? "photo" : "file.pdf")
  try {
    // Looked up again: the data may have been read anew while the file went in.
    const fresh = findOwn(account, req.params.id)
    await addMessage(
      account,
      fresh,
      { text: "", attachment: { file: kept.name, name, type, size: kept.bytes.length } },
      photo ? "사진을 보냈어요." : `파일을 보냈어요: ${name}`,
    )
    res.status(201).json({ conversation: view(fresh, sideOf(account), true) })
  } catch (error) {
    // The data went back to before the file; so does the store.
    await store.remove(chatFiles(conversation.id), [kept.name])
    throw error
  }
})

// A file of the conversation, for its two sides; the page fetches it with
// the login token. A PDF comes named to be saved, a photo to be shown.
conversationsRouter.get("/:id/attachments/:file", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const file = String(req.params.file)
  const attachment = conversation.messages.find((message) => message.attachment?.file === file)?.attachment
  if (!fileName.test(file) || !attachment) throw new HttpError(404, "파일을 찾을 수 없어요.")
  const bytes = await photos().get(chatFiles(conversation.id), file)
  if (!bytes) throw new HttpError(404, "파일을 찾을 수 없어요.")
  if (attachment.type === "pdf") res.attachment(attachment.name)
  res.type(photoType(file)).set("Cache-Control", "private, max-age=3600").send(bytes)
})

// Replaces the text of a message this side sent; both sides then see that
// it was edited. Deleted messages stay deleted.
conversationsRouter.put("/:id/messages/:messageId", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const message = findOwnMessage(conversation, side, req.params.messageId)
  if (message.deletedAt) throw new HttpError(409, "삭제한 메시지는 고칠 수 없어요.")
  if (message.attachment) throw new HttpError(409, "보낸 파일은 고칠 수 없어요. 지우고 다시 보내 주세요.")
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
    const attachment = message.attachment
    message.text = ""
    message.deletedAt = new Date().toISOString()
    delete message.editedAt
    delete message.attachment
    await saveDatabase()
    // Its file goes once the deletion is kept.
    if (attachment) await photos().remove(chatFiles(conversation.id), [attachment.file])
  }
  res.json({ conversation: view(conversation, side, true) })
})
