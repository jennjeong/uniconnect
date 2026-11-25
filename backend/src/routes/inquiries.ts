import { randomUUID } from "node:crypto"

import { HttpError } from "../lib/errors.js"
import { createRateLimit, senderKey } from "../lib/rateLimit.js"
import { inquiryCategories, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Inquiry } from "../types.js"
import { writeRouter } from "../middleware/retrying.js"

export const inquiriesRouter = writeRouter()

// 질문은 모두 데이터 문서에 들어가므로, 공개된 데모 계정까지 포함해 끝없이 쌓이지 않게 한다.
const questionsPerHour = createRateLimit({
  label: "도움말 질문",
  limit: 10,
  windowMs: 60 * 60 * 1000,
  message: "질문을 너무 많이 보냈어요. 1시간 뒤에 다시 보내 주세요.",
})
// 계정마다 답을 기다리는 질문의 최대 수다. 데모 계정은 주소마다 따로 세는 위 한도로는
// 막히지 않는다.
const maxWaiting = 50

// 질문한 사람에게 보이는 질문의 모습이다. 누가 물었는지는 담지 않는다.
export const inquiryView = ({ accountId: _accountId, ...inquiry }: Inquiry) => inquiry

// 계정 자신의 질문을 최신순으로, 답변이 있으면 함께 보여 준다.
inquiriesRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const inquiries = getDatabase()
    .inquiries.filter((inquiry) => inquiry.accountId === account.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ inquiries: inquiries.map(inquiryView) })
})

// 질문한 사람이 지금 달린 답변을 확인했으므로 알림 벨에서 내려 준다.
inquiriesRouter.post("/read", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const now = new Date().toISOString()
  let changed = false
  for (const inquiry of database.inquiries) {
    if (inquiry.accountId !== account.id || !inquiry.answeredAt || inquiry.answerReadAt) continue
    inquiry.answerReadAt = now
    changed = true
  }
  if (changed) await saveDatabase()
  const inquiries = database.inquiries
    .filter((inquiry) => inquiry.accountId === account.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ inquiries: inquiries.map(inquiryView) })
})

inquiriesRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const category = text(req.body?.category)
  const question = text(req.body?.question)
  if (!inquiryCategories.includes(category)) throw new HttpError(400, "질문 종류를 골라 주세요.")
  if (question.length < 5) throw new HttpError(400, "질문을 5자 이상 적어 주세요.")
  if (question.length > 1000) throw new HttpError(400, "질문은 1,000자 이하로 적어 주세요.")

  await questionsPerHour.take(senderKey(req, getDatabase(), account))
  const database = getDatabase()
  if (database.inquiries.filter((item) => item.accountId === account.id && !item.answeredAt).length >= maxWaiting) {
    throw new HttpError(429, "답을 기다리는 질문이 많아요. 답변을 받은 뒤 다시 보내 주세요.")
  }
  const inquiry: Inquiry = {
    id: randomUUID(),
    accountId: account.id,
    category,
    question,
    createdAt: new Date().toISOString(),
  }
  database.inquiries.push(inquiry)
  await saveDatabase()
  res.status(201).json({ inquiry: inquiryView(inquiry) })
})
