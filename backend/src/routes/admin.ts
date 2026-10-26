import { createHash, timingSafeEqual } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { platformStats } from "../lib/stats.js"
import { text } from "../lib/validation.js"
import { getDatabase, saveDatabase } from "../store.js"

// Operators read the questions sent from the FAQ page and answer them, and
// watch the platform's figures, with the ADMIN_TOKEN from the environment in
// the X-Admin-Token header (pages/AdminPage.tsx).
export const adminRouter = Router()

const adminFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "관리자 인증 실패가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

// Hashing both sides gives equal lengths for timingSafeEqual whatever was
// sent, Korean included.
const digest = (value: string) => createHash("sha256").update(value).digest()

function requireAdmin(req: Request) {
  const key = clientKey(req)
  adminFailures.check(key)
  const expected = config.adminToken
  const given = req.get("x-admin-token") ?? ""
  const match = Boolean(expected) && timingSafeEqual(digest(given), digest(expected ?? ""))
  if (!match) {
    adminFailures.hit(key)
    throw new HttpError(403, "관리자만 쓸 수 있어요.")
  }
}

// The platform's figures, real members' and with the demo data (lib/stats.ts).
adminRouter.get("/stats", (req, res) => {
  requireAdmin(req)
  res.json({ stats: platformStats(getDatabase()) })
})

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
  const database = getDatabase()
  const inquiry = database.inquiries.find((item) => item.id === req.params.id)
  if (!inquiry) throw new HttpError(404, "질문을 찾을 수 없어요.")
  const changed = inquiry.answer !== answer
  inquiry.answer = answer
  inquiry.answeredAt = new Date().toISOString()
  // A new or changed answer is news to the asker, by email and on the bell.
  if (changed) delete inquiry.answerReadAt
  await saveDatabase()
  if (changed) {
    const brief = (value: string, length: number) => (value.length > length ? `${value.slice(0, length)}…` : value)
    void notify(
      database.accounts.find((account) => account.id === inquiry.accountId),
      "문의에 답변이 왔어요",
      [
        `도움말 센터에 남긴 '${inquiry.category}' 질문에 운영자가 답했어요.`,
        `질문: ${brief(inquiry.question, 80)}`,
        `답변: ${brief(answer, 500)}`,
      ],
      "/faq",
    )
  }
  res.json({ inquiry })
})
