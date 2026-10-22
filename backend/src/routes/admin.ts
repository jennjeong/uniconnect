import { timingSafeEqual } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { HttpError } from "../lib/errors.js"
import { text } from "../lib/validation.js"
import { getDatabase, saveDatabase } from "../store.js"

// Operators read the questions sent from the FAQ page and answer them,
// with the ADMIN_TOKEN from the environment in the X-Admin-Token header.
// There is no admin screen yet; these routes are its seam.
export const adminRouter = Router()

function requireAdmin(req: Request) {
  const expected = config.adminToken
  const given = req.get("x-admin-token") ?? ""
  const match =
    expected !== undefined &&
    expected.length > 0 &&
    given.length === expected.length &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  if (!match) throw new HttpError(403, "관리자만 쓸 수 있어요.")
}

// Every question, unanswered first, then newest, with who sent it.
adminRouter.get("/inquiries", (req, res) => {
  requireAdmin(req)
  const database = getDatabase()
  const unanswered = (inquiry: { answer?: string }) => (inquiry.answer ? 1 : 0)
  const inquiries = [...database.inquiries]
    .sort((a, b) => unanswered(a) - unanswered(b) || b.createdAt.localeCompare(a.createdAt))
    .map((inquiry) => {
      const account = database.accounts.find((item) => item.id === inquiry.accountId)
      return {
        ...inquiry,
        from: account ? { name: account.name, role: account.role, email: account.email } : null,
      }
    })
  res.json({ inquiries })
})

adminRouter.post("/inquiries/:id/answer", async (req, res) => {
  requireAdmin(req)
  const answer = text(req.body?.answer)
  if (!answer) throw new HttpError(400, "답변을 적어 주세요.")
  if (answer.length > 2000) throw new HttpError(400, "답변은 2,000자 이하로 적어 주세요.")
  const inquiry = getDatabase().inquiries.find((item) => item.id === req.params.id)
  if (!inquiry) throw new HttpError(404, "질문을 찾을 수 없어요.")
  inquiry.answer = answer
  inquiry.answeredAt = new Date().toISOString()
  await saveDatabase()
  res.json({ inquiry })
})
