import { createHash, randomUUID, timingSafeEqual } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { adminLogRows, isLive, logAdmin, noteLimit, serviceHealth } from "../lib/adminTools.js"
import { markCancelled, markPaid, paymentsOf, toss } from "../lib/billing.js"
import { memberDetail, memberRow, overview, proposalRows } from "../lib/console.js"
import { todayInKorea } from "../lib/dates.js"
import { recentErrors } from "../lib/errorLog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { clientKey, createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { platformStats } from "../lib/stats.js"
import { text } from "../lib/validation.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Announcement, ReportAction } from "../types.js"

// 운영자는 FAQ 페이지에서 온 질문을 읽고 답하며 플랫폼의 수치를 본다. 환경의
// ADMIN_TOKEN을 X-Admin-Token 헤더로 보낸다(pages/AdminPage.tsx).
export const adminRouter = Router()

const adminFailures = createRateLimit({
  limit: 10,
  windowMs: 15 * 60 * 1000,
  message: "관리자 인증 실패가 너무 많아요. 15분 뒤에 다시 시도해 주세요.",
})

// 양쪽을 해시하면 무엇을 보냈든(한글이어도) 길이가 같아져 timingSafeEqual을
// 쓸 수 있다.
const digest = (value: string) => createHash("sha256").update(value).digest()

export async function requireAdmin(req: Request) {
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

// 모든 결제를 최신순으로 보여 준다. 확인을 기다리는 계좌 이체, 결제된 것,
// 환불된 것이다.
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

// 계좌 이체가 들어왔다. 주문이 결제된 것이 되어 산 것을 준다.
adminRouter.post("/payments/:id/paid", async (req, res) => {
  await requireAdmin(req)
  const payment = paymentFor(String(req.params.id))
  if (payment.status !== "pending") throw new HttpError(409, "기다리는 주문만 입금 확인할 수 있어요.")
  markPaid(getDatabase(), payment, { method: "transfer" })
  logAdmin(getDatabase(), "payment-paid", { kind: "payment", id: payment.id })
  await saveDatabase()
  res.json({ payment })
})

// 기다리는 주문을 취소하거나 결제된 주문을 환불한다. 카드 결제는 Toss
// Payments로, 이체는 운영자가 직접 환불하며(여기서는 기록만 한다) 산 것은
// 회수한다.
adminRouter.post("/payments/:id/cancel", async (req, res) => {
  await requireAdmin(req)
  const payment = paymentFor(String(req.params.id))
  if (payment.status === "cancelled") throw new HttpError(409, "이미 취소된 결제예요.")
  const reason = text(req.body?.reason) || (payment.status === "paid" ? "운영자 환불" : "운영자 취소")
  if (payment.status === "paid" && payment.paymentKey) await toss.cancel(payment.paymentKey, reason)
  markCancelled(getDatabase(), paymentFor(payment.id), reason)
  logAdmin(getDatabase(), "payment-cancelled", { kind: "payment", id: payment.id }, reason)
  await saveDatabase()
  res.json({ payment })
})

// 플랫폼의 수치로, 실제 회원 기준과 데모 데이터를 더한 것을 보여 준다(lib/stats.ts).
adminRouter.get("/stats", async (req, res) => {
  await requireAdmin(req)
  res.json({ stats: platformStats(getDatabase()) })
})

// 모든 질문을 답 없는 것부터, 그다음 최신순으로 보낸 사람과 함께 보여 준다.
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
        handling: database.inquiryHandling?.[inquiry.id] ?? null,
      }
    })
  res.json({ inquiries })
})

// 회원의 신고를 대기 중인 것부터, 그다음 최신순으로 보여 준다. 누가 누구를
// 무엇 때문에 신고했는지와 신고된 글 그대로를 담고, 지금까지 정지된 계정도
// 담아 복구할 수 있게 한다.
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

// 운영자가 신고를 처리한다. 그대로 두거나, 신고된 후기(와 그 답글) 또는
// 신고된 답글을 내리거나, 신고된 계정을 정지한다(로그인할 수 없고, 메일을
// 받지 못하고, 누구에게도 보이지 않으며, 세션이 끝난다). 공유 데모 계정은
// 정지할 수 없다.
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
  logAdmin(database, "report-resolved", { kind: "report", id: report.id }, action)
  await saveDatabase()
  res.json({ ok: true })
})

// 가장 최근의 서버와 브라우저 오류를 최신순으로 보여 준다.
adminRouter.get("/errors", async (req, res) => {
  await requireAdmin(req)
  res.json({ errors: await recentErrors() })
})

// 정지된 계정을 다시 들여보낸다.
adminRouter.post("/accounts/:id/unsuspend", async (req, res) => {
  await requireAdmin(req)
  const account = getDatabase().accounts.find((item) => item.id === req.params.id)
  if (!account?.suspendedAt) throw new HttpError(404, "정지된 계정을 찾을 수 없어요.")
  delete account.suspendedAt
  logAdmin(getDatabase(), "account-unsuspended", { kind: "account", id: account.id })
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
  // 새로 달거나 바뀐 답은 질문한 사람에게 소식이므로 메일과 알림 벨로 알린다.
  if (changed) delete inquiry.answerReadAt
  logAdmin(database, "inquiry-answered", { kind: "inquiry", id: inquiry.id })
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

// 콘솔의 개요다. 운영자가 처리할 것, 수치, 여덟 주의 추이, 매출을 보여 준다
// (lib/console.ts).
adminRouter.get("/overview", async (req, res) => {
  await requireAdmin(req)
  res.json(overview(getDatabase()))
})

// 모든 회원을 최신순으로 보여 주며, 이름, 이메일, 학교로 검색하고 쪽과
// 상태로 거를 수 있다.
adminRouter.get("/accounts", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const query = text(req.query.q).toLowerCase()
  const role = text(req.query.role)
  const state = text(req.query.state)
  const tag = text(req.query.tag)
  const rows = database.accounts
    .map((account) => memberRow(database, account))
    .filter((row) => !query || [row.name, row.email, row.school].some((value) => value.toLowerCase().includes(query)))
    .filter((row) => !role || row.role === role)
    .filter((row) => {
      if (state === "suspended") return Boolean(row.suspendedAt)
      if (state === "partners") return row.partnersUntil !== null
      if (state === "demo") return row.demo
      if (state === "duplicates") return row.duplicate
      const dormant = /^dormant(\d+)$/.exec(state)
      if (dormant) return Date.now() - Number(row.lastSeen ?? Date.parse(row.createdAt)) > Number(dormant[1]) * 24 * 60 * 60 * 1000
      return true
    })
    .filter((row) => !tag || row.tags.includes(tag))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ accounts: rows })
})

adminRouter.get("/accounts/:id", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = database.accounts.find((item) => item.id === req.params.id)
  if (!account) throw new HttpError(404, "회원을 찾을 수 없어요.")
  res.json({ account: memberDetail(database, account) })
})

// 회원을 바로 정지한다(로그인할 수 없고, 메일을 받지 못하고, 누구에게도 보이지
// 않으며, 세션이 끝난다). 신고로 인한 정지와 같다.
adminRouter.post("/accounts/:id/suspend", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = database.accounts.find((item) => item.id === req.params.id)
  if (!account) throw new HttpError(404, "회원을 찾을 수 없어요.")
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 정지할 수 없어요.")
  account.suspendedAt ??= new Date().toISOString()
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
  logAdmin(database, "account-suspended", { kind: "account", id: account.id })
  await saveDatabase()
  res.json({ account: memberDetail(database, account) })
})

// 모든 제안을 최신순으로 보여 준다.
adminRouter.get("/proposals", async (req, res) => {
  await requireAdmin(req)
  res.json({ proposals: proposalRows(getDatabase()) })
})

// 회원에 대한 운영자 메모다(비우면 지운다).
adminRouter.put("/accounts/:id/note", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = database.accounts.find((item) => item.id === req.params.id)
  if (!account) throw new HttpError(404, "회원을 찾을 수 없어요.")
  const note = text(req.body?.note)
  if (note.length > noteLimit) throw new HttpError(400, "메모는 1,000자 이하로 적어 주세요.")
  database.adminNotes ??= {}
  if (note) database.adminNotes[account.id] = { text: note, at: new Date().toISOString() }
  else delete database.adminNotes[account.id]
  logAdmin(database, "note-saved", { kind: "account", id: account.id })
  await saveDatabase()
  res.json({ account: memberDetail(database, account) })
})

// 운영자가 한 일을 최신순으로 보여 준다.
adminRouter.get("/log", async (req, res) => {
  await requireAdmin(req)
  res.json({ entries: adminLogRows(getDatabase()) })
})

// 이 API 복사본이 어떤 서비스에 맞게 설정되어 있는지 알려 준다(lib/adminTools.ts).
adminRouter.get("/health", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  res.json({
    ...serviceHealth(),
    data: {
      accounts: database.accounts.length,
      sessions: database.sessions.length,
      payments: database.payments?.length ?? 0,
      logEntries: database.adminLog?.length ?? 0,
    },
  })
})

const tones: Announcement["tone"][] = ["info", "warning"]
const audiences: Announcement["audience"][] = ["all", "학생단체", "브랜드"]

// 사이트의 공지를 지금 게시 중인 것부터 보여 준다.
adminRouter.get("/announcements", async (req, res) => {
  await requireAdmin(req)
  const today = todayInKorea()
  const items = [...(getDatabase().announcements ?? [])]
    .reverse()
    .map((item) => ({ ...item, live: isLive(item, today) }))
    .sort((a, b) => Number(b.live) - Number(a.live))
  res.json({ announcements: items })
})

adminRouter.post("/announcements", async (req, res) => {
  await requireAdmin(req)
  const message = text(req.body?.text)
  if (!message) throw new HttpError(400, "공지 내용을 적어 주세요.")
  if (message.length > 200) throw new HttpError(400, "공지는 200자 이하로 적어 주세요.")
  const tone = text(req.body?.tone) as Announcement["tone"]
  const audience = text(req.body?.audience) as Announcement["audience"]
  if (!tones.includes(tone) || !audiences.includes(audience)) throw new HttpError(400, "공지 종류와 대상을 골라 주세요.")
  const from = text(req.body?.from)
  if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new HttpError(400, "시작하는 날을 골라 주세요.")
  const until = text(req.body?.until)
  if (from && until && until < from) throw new HttpError(400, "끝나는 날을 시작하는 날 이후로 골라 주세요.")
  if (until && (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until < todayInKorea())) throw new HttpError(400, "끝나는 날을 오늘 이후로 골라 주세요.")
  const database = getDatabase()
  const item: Announcement = {
    id: randomUUID(),
    text: message,
    tone,
    audience,
    ...(from ? { from } : {}),
    ...(until ? { until } : {}),
    createdAt: new Date().toISOString(),
  }
  ;(database.announcements ??= []).push(item)
  logAdmin(database, "announcement-posted", { kind: "announcement", id: item.id })
  await saveDatabase()
  res.status(201).json({ announcement: item })
})

// 공지를 내린다.
adminRouter.post("/announcements/:id/end", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const item = database.announcements?.find((entry) => entry.id === req.params.id)
  if (!item) throw new HttpError(404, "공지를 찾을 수 없어요.")
  item.endedAt ??= new Date().toISOString()
  logAdmin(database, "announcement-ended", { kind: "announcement", id: item.id })
  await saveDatabase()
  res.json({ announcement: item })
})
