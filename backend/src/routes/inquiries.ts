import { randomUUID } from "node:crypto"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { inquiryCategories, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Inquiry } from "../types.js"

export const inquiriesRouter = Router()

// What the asker sees of a question: not who asked.
export const inquiryView = ({ accountId: _accountId, ...inquiry }: Inquiry) => inquiry

// The account's own questions, newest first, with any answers.
inquiriesRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const inquiries = getDatabase()
    .inquiries.filter((inquiry) => inquiry.accountId === account.id)
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

  const inquiry: Inquiry = {
    id: randomUUID(),
    accountId: account.id,
    category,
    question,
    createdAt: new Date().toISOString(),
  }
  const database = getDatabase()
  database.inquiries.push(inquiry)
  await saveDatabase()
  res.status(201).json({ inquiry: inquiryView(inquiry) })
})
