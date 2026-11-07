import { createHash, randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { Router, type Response } from "express"

import { findListing, shownCatalog, shownTo } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { chatFiles, fileName, forgetPhotos, parsePdf, parsePhoto, photoType, photos } from "../lib/photos.js"
import { createRateLimit, senderKey } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, refreshDatabase, saveDatabase } from "../store.js"
import { todayInKorea } from "../lib/dates.js"
import type { Account, ChatAttachment, ChatSide, Conversation, Database, Meeting } from "../types.js"

export const conversationsRouter = Router()

const sideOf = (account: Account): ChatSide => (account.role === "학생단체" ? "group" : "brand")

// 메시지 본문이다. 필수이며 1,000자까지 쓸 수 있다.
function messageText(value: unknown) {
  const message = text(value)
  if (!message) throw new HttpError(400, "메시지를 입력해 주세요.")
  if (message.length > 1000) throw new HttpError(400, "메시지는 1,000자 이하로 보내 주세요.")
  return message
}

// 한쪽에서 보는 대화다. 상대편, 마지막 메시지, 읽지 않은 수를 담고, 요청하면
// 모든 메시지에 내 것인지 상대편 것인지를 표시해 담는다. 내 메시지에는
// 상대편이 읽었는지를 알리고, 수정되거나 삭제된 메시지는 양쪽에 그렇다고 알린다.
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
      // 메시지는 계정이 있는 상대편에게만 간다.
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
          ...(last.meeting && !last.deletedAt ? { meeting: true } : {}),
        }
      : null,
    // 보낸 사람이 삭제한 메시지는 읽기를 기다리지 않는다.
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
            ...(message.meeting && !message.deletedAt ? { meeting: message.meeting } : {}),
          })),
        }
      : {}),
  }
}

// 계정이 참여하는 대화 `id`다. 상대편은 계정이 여전히 볼 수 있는 쪽이어야
// 한다(어느 쪽이 차단한 상대는 제외한다).
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

// 대화에서 이쪽이 보낸 메시지다. 보낸 쪽만 바꿀 수 있다.
function findOwnMessage(conversation: Conversation, side: ChatSide, id: string) {
  const message = conversation.messages.find((item) => item.id === id)
  if (!message) throw new HttpError(404, "메시지를 찾을 수 없어요.")
  if (message.from !== side) throw new HttpError(403, "내가 보낸 메시지만 고치거나 지울 수 있어요.")
  return message
}

// 계정의 대화를 최신순으로 보여 준다. 방문자에게는 없고, 회원은 예시와의
// 대화를 두지 않는다(예시를 분리하기 전에 생긴 것도 제외한다).
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

// 브랜드(단체의 경우) 또는 단체(브랜드의 경우)와의 대화를 열고, 처음이면
// 시작한다. 상대편이 누가 문의하는지 볼 수 있도록 계정에 자기 리스팅이
// 먼저 있어야 한다.
conversationsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const listing = findListing(database, account)
  if (!listing) throw new HttpError(409, "먼저 내 정보에서 소개를 등록해 주세요.")
  const partnerId = text(req.body?.partnerId)
  const side = sideOf(account)
  // 계정이 볼 수 있는 상대편만 된다. 회원은 회원과 이야기한다.
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

// 모든 메시지를 돌려주며, 읽으면 이쪽에서는 대화를 읽음으로 표시한다.
// 열려 있는 대화의 요청이 새 소식을 얼마나 기다리는지와 그동안 얼마나 자주
// 살피는지를 정한다(테스트에서는 둘 다 줄인다). 함수의 30초 제한(vercel.json)
// 안에서 정한다.
export const chatWait = { holdMs: 20_000, tickMs: 1000 }

// 이 API 복사본이 대화를 바꾸면 그 대화를 기다리던 요청을 깨운다. 다른
// 복사본에서 바뀐 것은 주기마다 데이터를 새로 읽을 때(refreshDatabase)
// 알아낸다.
const changes = new EventEmitter().setMaxListeners(0)
const changed = (conversationId: string) => changes.emit(conversationId)

// 한쪽이 보는 대화의 모습을 몇 글자로 줄인 것이다. 페이지가 바뀐 때만
// 알려 달라고 요청할 수 있게 한다.
const stampOf = (conversation: Conversation, side: ChatSide) =>
  createHash("sha256").update(JSON.stringify(view(conversation, side, true))).digest("base64url").slice(0, 16)

// 대화가 이쪽에서 `since`와 달라 보일 때까지(또는 대기 시간이 끝나거나
// 페이지가 사라질 때까지) 기다렸다가 메시지를 돌려준다.
async function waitForChange(res: Response, account: Account, id: string, since: string) {
  const side = sideOf(account)
  const until = Date.now() + chatWait.holdMs
  let gone = false
  // 페이지가 사라지면 답하던 연결을 일찍 닫는다.
  res.on("close", () => {
    gone = true
  })
  while (!gone && Date.now() < until && stampOf(findOwn(account, id), side) === since) {
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer)
        changes.off(id, wake)
        resolve()
      }
      const timer = setTimeout(wake, Math.min(chatWait.tickMs, Math.max(0, until - Date.now())))
      changes.once(id, wake)
    })
    await refreshDatabase()
  }
}

// 마지막 메시지까지 읽은 상태로 모든 메시지와 함께 돌려주는 대화다.
// ?since=(페이지가 보여 주는 내용의 표식)가 있으면 변화가 있을 때까지
// 기다려 답하므로, 페이지가 새 메시지, 읽음, 수정, 삭제를 바로 알게 된다.
conversationsRouter.get("/:id", async (req, res) => {
  const account = requireAccount(req)
  findOwn(account, req.params.id)
  if (typeof req.query.since === "string" && req.query.since) await waitForChange(res, account, req.params.id, req.query.since)
  // 다시 찾는다. 기다리는 동안 데이터를 새로 읽었을 수 있다.
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const last = conversation.messages.at(-1)
  if (last && (conversation.readAt[side] ?? "") < last.at) {
    conversation.readAt[side] = last.at
    await saveDatabase()
    changed(conversation.id)
  }
  res.json({ conversation: view(conversation, side, true), stamp: stampOf(conversation, side) })
})

// 사람이 입력하는 속도보다 빠르거나 하루치 대화보다 많으면 폭주다. 메시지마다
// 상대편에게 메일이 갈 수 있다.
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

// 아무것도 저장하기 전에 메시지를 폭주 제한에 센다.
async function countMessage(req: Parameters<typeof senderKey>[0], account: Account) {
  const key = senderKey(req, getDatabase(), account)
  await messagesPerMinute.check(key)
  await messagesPerHour.take(key)
  await messagesPerMinute.hit(key)
}

// 이 계정 쪽에서 보낸 메시지를 더하고 저장한다. 상대편에게는 읽지 않은
// 메시지 묶음마다 한 번만 메일을 보내며, 이쪽이 앞서 보낸 것을 상대편이 모두
// 읽었을 때만 보낸다(`line`은 메일에 보이는 내용이다).
async function addMessage(
  account: Account,
  conversation: Conversation,
  entry: { text: string; attachment?: ChatAttachment; meeting?: Meeting },
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
  changed(conversation.id)
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
  await countMessage(req, account)
  await addMessage(account, conversation, { text: message }, message.slice(0, 80))
  res.status(201).json({ conversation: view(conversation, sideOf(account), true) })
})

// 미팅의 최대 길이이며 단위는 분이다.
const meetingLengths = [30, 60, 90, 120]

// 요청받은 미팅이다. 오늘부터의 날짜(한국 시간), 시작 시각, 정해진 길이 중
// 하나, 장소를 담고, 메시지로 남길 메모는 선택이다.
function parseMeeting(body: Record<string, unknown> | undefined) {
  const date = text(body?.date)
  const time = text(body?.time)
  const minutes = Number(body?.minutes)
  const place = text(body?.place)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new HttpError(400, "미팅 날짜를 골라 주세요.")
  }
  if (date < todayInKorea()) throw new HttpError(400, "오늘이나 그 뒤의 날짜를 골라 주세요.")
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(400, "미팅 시작 시각을 골라 주세요.")
  if (!meetingLengths.includes(minutes)) throw new HttpError(400, "미팅 시간을 목록에서 골라 주세요.")
  if (!place || place.length > 100) throw new HttpError(400, "장소나 화상 회의 링크를 100자 이하로 적어 주세요.")
  const note = text(body?.note)
  if (note.length > 300) throw new HttpError(400, "메모는 300자 이하로 적어 주세요.")
  return { meeting: { date, time, minutes, place, status: "proposed" as const }, note }
}

// 미팅 잡기다. 제안한 미팅은 따로 하나의 메시지가 되며, 상대편이 수락하거나
// 거절하고 기다리는 동안 보낸 쪽이 취소할 수 있다.
conversationsRouter.post("/:id/meetings", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const { meeting, note } = parseMeeting(req.body)
  await countMessage(req, account)
  const line = `미팅 제안: ${meeting.date} ${meeting.time} · ${meeting.place}`
  await addMessage(account, conversation, { text: note || line, meeting }, line)
  res.status(201).json({ conversation: view(conversation, sideOf(account), true) })
})

const meetingAnswers: Record<string, Meeting["status"]> = { accept: "accepted", decline: "declined", cancel: "canceled" }

conversationsRouter.post("/:id/meetings/:messageId/answer", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const message = conversation.messages.find((item) => item.id === req.params.messageId)
  if (!message?.meeting || message.deletedAt) throw new HttpError(404, "미팅 제안을 찾을 수 없어요.")
  const answer = String(req.body?.answer ?? "")
  const status = Object.hasOwn(meetingAnswers, answer) ? meetingAnswers[answer] : undefined
  if (!status) throw new HttpError(400, "수락, 거절, 취소 가운데 골라 주세요.")
  // 보낸 쪽은 취소하고, 상대편은 수락하거나 거절한다.
  if ((status === "canceled") !== (message.from === side)) {
    throw new HttpError(403, status === "canceled" ? "보낸 쪽만 미팅 제안을 취소할 수 있어요." : "받은 쪽만 미팅 제안에 답할 수 있어요.")
  }
  if (message.meeting.status !== "proposed" && !(status === "canceled" && message.meeting.status === "accepted")) {
    throw new HttpError(409, "이미 답한 미팅 제안이에요.")
  }
  message.meeting.status = status
  message.meeting.answeredAt = new Date().toISOString()
  await saveDatabase()
  changed(conversation.id)
  const other: ChatSide = side === "group" ? "brand" : "group"
  const partner = getDatabase().accounts.find((item) =>
    other === "brand" ? item.brandId === conversation.brandId : item.groupId === conversation.groupId,
  )
  const word = status === "accepted" ? "수락했어요" : status === "declined" ? "거절했어요" : "취소했어요"
  void notify(
    partner,
    "messages",
    `미팅 제안을 ${word}`,
    [`${account.name}에서 ${message.meeting.date} ${message.meeting.time} 미팅을 ${word}.`],
    `/messages/${conversation.id}`,
  )
  res.json({ conversation: view(conversation, side, true) })
})

// 한 계정이 대화에서 보관하는 파일의 총 바이트 수다.
const maxStoredBytes = 10 * 1024 * 1024

// 이 계정 쪽이 보내서 아직 보관 중인 파일의 바이트 수다.
function storedBytes(database: Database, account: Account) {
  const listing = findListing(database, account)
  const side = sideOf(account)
  if (!listing) return 0
  return database.conversations
    .filter((conversation) => conversation[`${side}Id`] === listing.id)
    .flatMap((conversation) => conversation.messages)
    .reduce((sum, message) => sum + (message.from === side && message.attachment ? message.attachment.size : 0), 0)
}

// 본문 없이 파일 하나가 메시지가 되는 경우다. 브라우저가 줄인 사진(PNG, JPG,
// WebP)이거나 2MB 이하의 PDF이며, lib/photos.ts로 보관한다. 계정마다 파일을
// 최대 10MB까지 보관하고, 공유 데모 계정은 써 보는 모두에게 보이게 되므로
// 파일을 보내지 못한다. 더 큰 본문은 app.ts의 전용 파서가 받는다.
conversationsRouter.post("/:id/attachments", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  if (isDemoAccount(getDatabase(), account)) throw new HttpError(403, "데모 계정은 파일을 보낼 수 없어요.")
  // 보낼 때의 이름이되 폴더와 이상한 문자는 뺀다.
  const sentName = text(req.body?.name).split(/[\\/]/).pop()!.replace(/[\u0000-\u001f]/g, "").slice(0, 80)
  const photo = parsePhoto(req.body?.file)
  const kept = photo ?? parsePdf(req.body?.file)
  if (!kept) throw new HttpError(400, "사진(PNG, JPG, WebP)이나 2MB 이하의 PDF를 보내 주세요.")
  if (storedBytes(getDatabase(), account) + kept.bytes.length > maxStoredBytes) {
    throw new HttpError(409, "보낸 파일이 10MB를 넘어요. 지난 파일 메시지를 지운 뒤 다시 보내 주세요.")
  }
  await countMessage(req, account)
  const store = photos()
  await store.put(chatFiles(conversation.id), kept.name, kept.bytes)
  const type = photo ? "image" : "pdf"
  const name = sentName || (photo ? "photo" : "file.pdf")
  try {
    // 다시 찾는다. 파일이 들어오는 동안 데이터를 새로 읽었을 수 있다.
    const fresh = findOwn(account, req.params.id)
    await addMessage(
      account,
      fresh,
      { text: "", attachment: { file: kept.name, name, type, size: kept.bytes.length } },
      photo ? "사진을 보냈어요." : `파일을 보냈어요: ${name}`,
    )
    res.status(201).json({ conversation: view(fresh, sideOf(account), true) })
  } catch (error) {
    // 데이터가 파일을 넣기 전으로 돌아갔으므로 파일 저장소도 돌린다.
    await store.remove(chatFiles(conversation.id), [kept.name])
    throw error
  }
})

// 대화의 파일을 양쪽에 보여 준다. 페이지는 로그인 토큰으로 가져온다. PDF는
// 저장할 이름으로, 사진은 보여 줄 형태로 내려간다.
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

// 이쪽이 보낸 메시지의 본문을 바꾼다. 그러면 양쪽이 수정되었다는 것을
// 본다. 삭제된 메시지는 계속 삭제된 채로 있다.
conversationsRouter.put("/:id/messages/:messageId", async (req, res) => {
  const account = requireAccount(req)
  const conversation = findOwn(account, req.params.id)
  const side = sideOf(account)
  const message = findOwnMessage(conversation, side, req.params.messageId)
  if (message.deletedAt) throw new HttpError(409, "삭제한 메시지는 고칠 수 없어요.")
  if (message.attachment) throw new HttpError(409, "보낸 파일은 고칠 수 없어요. 지우고 다시 보내 주세요.")
  if (message.meeting) throw new HttpError(409, "미팅 제안은 고칠 수 없어요. 지우고 다시 보내 주세요.")
  const edited = messageText(req.body?.text)
  if (edited !== message.text) {
    message.text = edited
    message.editedAt = new Date().toISOString()
    await saveDatabase()
    changed(conversation.id)
  }
  res.json({ conversation: view(conversation, side, true) })
})

// 이쪽이 보낸 메시지를 지운다. 본문은 없애고, 양쪽이 그 자리에 메시지가
// 삭제되었다는 표시를 본다.
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
    changed(conversation.id)
    // 삭제가 저장된 뒤에 그 파일을 지운다.
    if (attachment) await forgetPhotos(chatFiles(conversation.id), [attachment.file])
  }
  res.json({ conversation: view(conversation, side, true) })
})
