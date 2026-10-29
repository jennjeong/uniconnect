import { createHash, timingSafeEqual } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { markCancelled, markPaid, paymentsOf, toss } from "../lib/billing.js"
import { recentErrors } from "../lib/errorLog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { platformStats } from "../lib/stats.js"
import { text } from "../lib/validation.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { ReportAction } from "../types.js"

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

async function requireAdmin(req: Request) {
  const key = clientKey(req)
  await adminFailures.check(key)
  const expected = config.adminToken
  const given = req.get("x-admin-token") ?? ""
  const match = Boolean(expected) && timingSafeEqual(digest(given), digest(expected ?? ""))
  if (!match) {
    await adminFailures.hit(key)
    throw new HttpError(403, "관리자만 쓸 수 있어요.")
  }
}

// Every payment, newest first: bank transfers waiting to be confirmed, what
// was paid and refunded.
adminRouter.get("/payments", async (req, res) => {
  await requireAdmin(req)
  const payments = [...paymentsOf(getDatabase())]
    .reverse()
    .map(({ paymentKey, ...payment }) => ({ ...payment, card: Boolean(paymentKey) }))
  res.json({ payments })
})

function paymentFor(id: string) {
  const payment = paymentsOf(getDatabase()).find((item) => item.id === id)
  if (!payment) throw new HttpError(404, "결제를 찾을 수 없어요.")
  return payment
}

// A bank transfer arrived: the order is paid, and gives what it bought.
adminRouter.post("/payments/:id/paid", async (req, res) => {
  await requireAdmin(req)
  const payment = paymentFor(String(req.params.id))
  if (payment.status !== "pending") throw new HttpError(409, "기다리는 주문만 입금 확인할 수 있어요.")
  markPaid(getDatabase(), payment, { method: "transfer" })
  await saveDatabase()
  res.json({ payment })
})

// Cancels a waiting order, or refunds a paid one: a card payment through
// Toss Payments, a transfer by the operators themselves (this only
// records it). What it bought is taken back.
adminRouter.post("/payments/:id/cancel", async (req, res) => {
  await requireAdmin(req)
  const payment = paymentFor(String(req.params.id))
  if (payment.status === "cancelled") throw new HttpError(409, "이미 취소된 결제예요.")
  const reason = text(req.body?.reason) || (payment.status === "paid" ? "운영자 환불" : "운영자 취소")
  if (payment.status === "paid" && payment.paymentKey) await toss.cancel(payment.paymentKey, reason)
  markCancelled(getDatabase(), paymentFor(payment.id), reason)
  await saveDatabase()
  res.json({ payment })
})

// The platform's figures, real members' and with the demo data (lib/stats.ts).
adminRouter.get("/stats", async (req, res) => {
  await requireAdmin(req)
  res.json({ stats: platformStats(getDatabase()) })
})

// Every question, unanswered first, then newest, with who sent it.
adminRouter.get("/inquiries", async (req, res) => {
  await requireAdmin(req)
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

// Members' reports, the ones waiting first, then the newest: who reported
// whom over what, with the reported text as it was; and the accounts
// stopped so far, to restore.
adminRouter.get("/reports", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const person = (id: string) => {
    const account = database.accounts.find((item) => item.id === id)
    return account ? { id, name: account.name, role: account.role, email: account.email } : null
  }
  const settled = (report: { resolution?: unknown }) => (report.resolution ? 1 : 0)
  const reports = [...database.reports]
    .sort((a, b) => settled(a) - settled(b) || b.createdAt.localeCompare(a.createdAt))
    .map(({ reporterId, accountId, ...report }) => ({ ...report, reporter: person(reporterId), about: person(accountId) }))
  const suspended = database.accounts
    .filter((account) => account.suspendedAt)
    .map((account) => ({ id: account.id, name: account.name, role: account.role, email: account.email, suspendedAt: account.suspendedAt }))
  res.json({ reports, suspended })
})

const reportActions: ReportAction[] = ["dismiss", "hide-review", "hide-reply", "suspend"]

// The operators settle a report: leave things as they are, take the
// reported review (with its reply) or the reported reply down, or stop the
// reported account (it can't log in,
// gets no email and shows to no one; its sessions end). The shared demo
// accounts can't be stopped.
adminRouter.post("/reports/:id/resolve", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const report = database.reports.find((item) => item.id === req.params.id)
  if (!report) throw new HttpError(404, "신고를 찾을 수 없어요.")
  const action = text(req.body?.action) as ReportAction
  if (!reportActions.includes(action)) throw new HttpError(400, "처리 방법을 골라 주세요.")
  const now = new Date().toISOString()
  if (action === "hide-review") {
    const { target } = report
    const review = target.kind === "review" ? database.reviews.find((item) => item.id === target.reviewId) : undefined
    if (!review) throw new HttpError(409, "내릴 후기가 없어요.")
    review.hiddenAt = now
  }
  if (action === "hide-reply") {
    const { target } = report
    const review = target.kind === "reply" ? database.reviews.find((item) => item.id === target.reviewId) : undefined
    if (!review?.reply) throw new HttpError(409, "내릴 답글이 없어요.")
    review.reply.hiddenAt = now
  }
  if (action === "suspend") {
    const account = database.accounts.find((item) => item.id === report.accountId)
    if (!account) throw new HttpError(409, "이미 탈퇴한 회원이에요.")
    if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 정지할 수 없어요.")
    account.suspendedAt = now
    database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
  }
  report.resolution = { action, at: now }
  await saveDatabase()
  res.json({ ok: true })
})

// The latest server and browser errors, newest first.
adminRouter.get("/errors", async (req, res) => {
  await requireAdmin(req)
  res.json({ errors: await recentErrors() })
})

// Lets a stopped account back in.
adminRouter.post("/accounts/:id/unsuspend", async (req, res) => {
  await requireAdmin(req)
  const account = getDatabase().accounts.find((item) => item.id === req.params.id)
  if (!account?.suspendedAt) throw new HttpError(404, "정지된 계정을 찾을 수 없어요.")
  delete account.suspendedAt
  await saveDatabase()
  res.status(204).end()
})

adminRouter.post("/inquiries/:id/answer", async (req, res) => {
  await requireAdmin(req)
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
      "account",
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
