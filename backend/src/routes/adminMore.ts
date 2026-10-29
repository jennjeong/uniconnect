import { randomUUID } from "node:crypto"
import { Router } from "express"

import {
  agreementRow,
  allEvents,
  cohorts,
  distribution,
  fieldAlerts,
  funnel,
  inviteStats,
  liveEvents,
  monthKpi,
  proposalDetail,
  recipientOf,
  staleProposals,
  topSearches,
} from "../lib/adminInsights.js"
import { cleanTags, grantPartners, logAdmin, resetExamples } from "../lib/adminTools.js"
import { memberDetail } from "../lib/console.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { limitStatus } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { currentStorage } from "../lib/storage.js"
import { text } from "../lib/validation.js"
import { getDatabase, saveDatabase, upgradeDatabase } from "../store.js"
import type { Account, Database, FaqEntry } from "../types.js"
import { requireAdmin } from "./admin.js"

// More of the operators' console (pages/AdminMore.tsx): member tools,
// sponsorship operations, content, analysis and the system. Every route
// needs the ADMIN_TOKEN, and every change goes in the operators' log.
export const adminMoreRouter = Router()

const accountFor = (database: Database, id: string) => {
  const account = database.accounts.find((item) => item.id === id)
  if (!account) throw new HttpError(404, "회원을 찾을 수 없어요.")
  return account
}

const endSessions = (database: Database, account: Account) => {
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
}

// Logs a member out everywhere without stopping it.
adminMoreRouter.post("/accounts/:id/logout", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = accountFor(database, String(req.params.id))
  endSessions(database, account)
  logAdmin(database, "account-logged-out", { kind: "account", id: account.id })
  await saveDatabase()
  res.json({ account: memberDetail(database, account) })
})

adminMoreRouter.put("/accounts/:id/tags", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = accountFor(database, String(req.params.id))
  const tags = cleanTags(req.body?.tags)
  database.adminTags ??= {}
  if (tags.length) database.adminTags[account.id] = tags
  else delete database.adminTags[account.id]
  logAdmin(database, "account-tagged", { kind: "account", id: account.id }, tags.join(", "))
  await saveDatabase()
  res.json({ account: memberDetail(database, account) })
})

// One action on many members: stop them, log them out, or add or take
// off a tag. The demo accounts are passed over for stopping.
adminMoreRouter.post("/accounts/bulk", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : []
  const action = text(req.body?.action)
  const tag = cleanTags([req.body?.tag])[0]
  if (!["suspend", "logout", "tag", "untag"].includes(action)) throw new HttpError(400, "할 일을 골라 주세요.")
  if ((action === "tag" || action === "untag") && !tag) throw new HttpError(400, "태그를 적어 주세요.")
  let done = 0
  for (const id of ids) {
    const account = database.accounts.find((item) => item.id === id)
    if (!account) continue
    if (action === "suspend") {
      if (isDemoAccount(database, account) || account.suspendedAt) continue
      account.suspendedAt = new Date().toISOString()
      endSessions(database, account)
      logAdmin(database, "account-suspended", { kind: "account", id: account.id })
    } else if (action === "logout") {
      endSessions(database, account)
      logAdmin(database, "account-logged-out", { kind: "account", id: account.id })
    } else {
      database.adminTags ??= {}
      const current = database.adminTags[account.id] ?? []
      const next = action === "tag" ? cleanTags([...current, tag]) : current.filter((item) => item !== tag)
      if (next.length) database.adminTags[account.id] = next
      else delete database.adminTags[account.id]
      logAdmin(database, "account-tagged", { kind: "account", id: account.id }, next.join(", "))
    }
    done += 1
  }
  await saveDatabase()
  res.json({ done })
})

// Marks a brand's business as checked by hand (when the tax office's check
// can't be reached), or takes the mark off.
adminMoreRouter.put("/accounts/:id/business", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = accountFor(database, String(req.params.id))
  if (account.role !== "브랜드") throw new HttpError(400, "브랜드만 사업자 확인을 할 수 있어요.")
  if (req.body?.verified) {
    const number = text(req.body?.number).replace(/\D/g, "")
    if (number.length !== 10) throw new HttpError(400, "사업자등록번호 10자리를 적어 주세요.")
    account.business = { number, verifiedAt: new Date().toISOString() }
  } else {
    delete account.business
  }
  logAdmin(database, "business-set", { kind: "account", id: account.id }, req.body?.verified ? "확인" : "취소")
  await saveDatabase()
  res.json({ account: memberDetail(database, account) })
})

// Gives a member Campus Partners for 1 to 365 days, free.
adminMoreRouter.post("/accounts/:id/partners", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = accountFor(database, String(req.params.id))
  const days = Number(req.body?.days)
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, "기간을 1일에서 365일 사이로 적어 주세요.")
  grantPartners(database, account, days)
  logAdmin(database, "partners-granted", { kind: "account", id: account.id }, `${days}`)
  await saveDatabase()
  res.json({ account: memberDetail(database, account) })
})

// Puts the example data back as the seed has it, before a demonstration.
adminMoreRouter.post("/demo/reset", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  await resetExamples(database)
  upgradeDatabase(database)
  logAdmin(database, "demo-reset", { kind: "site", id: "demo" })
  await saveDatabase()
  res.json({ ok: true })
})

adminMoreRouter.get("/proposals/stale", async (req, res) => {
  await requireAdmin(req)
  res.json({ proposals: staleProposals(getDatabase()) })
})

adminMoreRouter.get("/proposals/:id", async (req, res) => {
  await requireAdmin(req)
  const detail = proposalDetail(getDatabase(), String(req.params.id))
  if (!detail) throw new HttpError(404, "제안을 찾을 수 없어요.")
  res.json({ proposal: detail })
})

// Reminds the member a proposal is waiting on, once in three days.
adminMoreRouter.post("/proposals/:id/nudge", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const proposal = [...database.requests, ...database.offers].find((item) => item.id === req.params.id)
  if (!proposal) throw new HttpError(404, "제안을 찾을 수 없어요.")
  const to = recipientOf(database, proposal)
  if (!to) throw new HttpError(409, "알림을 받을 회원이 없어요.")
  const recent = (database.adminLog ?? []).some(
    (entry) => entry.action === "proposal-nudged" && entry.target.id === proposal.id && Date.now() - Date.parse(entry.at) < 3 * 24 * 60 * 60 * 1000,
  )
  if (recent) throw new HttpError(409, "3일 안에 이미 알렸어요.")
  const name = "eventName" in proposal ? proposal.eventName : proposal.campaignName
  logAdmin(database, "proposal-nudged", { kind: "proposal", id: proposal.id })
  await saveDatabase()
  void notify(
    to,
    "proposals",
    "답을 기다리는 협찬 제안이 있어요",
    [`'${name}' 협찬 제안이 답을 기다리고 있어요.`, "수락하거나 거절해 주시면 상대가 다음 준비를 할 수 있어요."],
    to.role === "브랜드" ? "/requests" : "/offers",
  )
  res.json({ ok: true })
})

// Every agreement with where it stands, the latest changed first.
adminMoreRouter.get("/agreements", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const rows = database.agreements.map((agreement) => agreementRow(database, agreement)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  res.json({ agreements: rows })
})

adminMoreRouter.get("/events", async (req, res) => {
  await requireAdmin(req)
  res.json({ events: allEvents(getDatabase()) })
})

// Events under way and what looks wrong at any event.
adminMoreRouter.get("/live", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  res.json({ events: liveEvents(database), alerts: fieldAlerts(database) })
})

// Every board post with its poster, newest first.
adminMoreRouter.get("/posts", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const posts = [...database.posts].reverse().map((post) => ({
    id: post.id,
    title: post.title,
    poster: database.accounts.find((account) => account.id === post.accountId)?.name ?? "",
    deadline: post.deadline,
    createdAt: post.createdAt,
    closedAt: post.closedAt ?? null,
    hiddenAt: post.hiddenAt ?? null,
  }))
  res.json({ posts })
})

adminMoreRouter.post("/posts/:id/:action", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const post = database.posts.find((item) => item.id === req.params.id)
  if (!post) throw new HttpError(404, "모집 글을 찾을 수 없어요.")
  const action = String(req.params.action)
  const now = new Date().toISOString()
  if (action === "hide") post.hiddenAt = now
  else if (action === "show") delete post.hiddenAt
  else if (action === "close") post.closedAt ??= now
  else throw new HttpError(400, "할 일을 골라 주세요.")
  logAdmin(database, action === "hide" ? "post-hidden" : action === "show" ? "post-shown" : "post-closed", { kind: "post", id: post.id })
  await saveDatabase()
  res.status(204).end()
})

// Every review with whom it is about, newest first.
adminMoreRouter.get("/reviews", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const listingName = (id: string) => [...database.brands, ...database.groups].find((item) => item.id === id)?.name ?? ""
  const reviews = [...database.reviews]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((review) => ({
      id: review.id,
      author: review.authorName,
      about: listingName(review.aboutId),
      event: review.eventName,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      hiddenAt: review.hiddenAt ?? null,
      pinnedAt: review.pinnedAt ?? null,
    }))
  res.json({ reviews })
})

adminMoreRouter.post("/reviews/:id/:action", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const review = database.reviews.find((item) => item.id === req.params.id)
  if (!review) throw new HttpError(404, "후기를 찾을 수 없어요.")
  const action = String(req.params.action)
  const now = new Date().toISOString()
  const logged = { hide: "review-hidden", show: "review-shown", pin: "review-pinned", unpin: "review-unpinned" } as const
  if (!Object.hasOwn(logged, action)) throw new HttpError(400, "할 일을 골라 주세요.")
  if (action === "hide") review.hiddenAt = now
  if (action === "show") delete review.hiddenAt
  if (action === "pin") review.pinnedAt = now
  if (action === "unpin") delete review.pinnedAt
  logAdmin(database, logged[action as keyof typeof logged], { kind: "review", id: review.id })
  await saveDatabase()
  res.status(204).end()
})

adminMoreRouter.get("/invites", async (req, res) => {
  await requireAdmin(req)
  res.json(inviteStats(getDatabase()))
})

// Who handles a question, and whether it waits on something.
adminMoreRouter.put("/inquiries/:id/handling", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const inquiry = database.inquiries.find((item) => item.id === req.params.id)
  if (!inquiry) throw new HttpError(404, "질문을 찾을 수 없어요.")
  const assignee = text(req.body?.assignee).slice(0, 20)
  const held = Boolean(req.body?.held)
  database.inquiryHandling ??= {}
  const before = database.inquiryHandling[inquiry.id]
  const next = { ...(assignee ? { assignee } : {}), ...(held ? { heldAt: before?.heldAt ?? new Date().toISOString() } : {}) }
  if (Object.keys(next).length) database.inquiryHandling[inquiry.id] = next
  else delete database.inquiryHandling[inquiry.id]
  logAdmin(database, "inquiry-handled", { kind: "inquiry", id: inquiry.id }, [assignee, held ? "보류" : ""].filter(Boolean).join(" · "))
  await saveDatabase()
  res.json({ handling: database.inquiryHandling[inquiry.id] ?? null })
})

const faqTopics: FaqEntry["topic"][] = ["start", "account", "proposal", "schedule", "message", "results"]

adminMoreRouter.get("/faq", async (req, res) => {
  await requireAdmin(req)
  res.json(getDatabase().faq ?? { added: [], hidden: [] })
})

adminMoreRouter.post("/faq", async (req, res) => {
  await requireAdmin(req)
  const topic = text(req.body?.topic) as FaqEntry["topic"]
  const question = text(req.body?.question)
  const answer = text(req.body?.answer)
  if (!faqTopics.includes(topic)) throw new HttpError(400, "주제를 골라 주세요.")
  if (!question || !answer) throw new HttpError(400, "질문과 답을 적어 주세요.")
  if (question.length > 100 || answer.length > 1000) throw new HttpError(400, "질문은 100자, 답은 1,000자 이하로 적어 주세요.")
  const database = getDatabase()
  const faq = (database.faq ??= { added: [], hidden: [] })
  const entry: FaqEntry = { id: randomUUID(), topic, question, answer, ...(req.body?.featured ? { featured: true } : {}), createdAt: new Date().toISOString() }
  faq.added.push(entry)
  logAdmin(database, "faq-changed", { kind: "site", id: entry.id }, question)
  await saveDatabase()
  res.status(201).json(faq)
})

adminMoreRouter.delete("/faq/:id", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const faq = (database.faq ??= { added: [], hidden: [] })
  const entry = faq.added.find((item) => item.id === req.params.id)
  if (!entry) throw new HttpError(404, "질문을 찾을 수 없어요.")
  faq.added = faq.added.filter((item) => item !== entry)
  logAdmin(database, "faq-changed", { kind: "site", id: entry.id }, entry.question)
  await saveDatabase()
  res.json(faq)
})

// Hides one of the built-in questions (by its Korean wording), or shows it again.
adminMoreRouter.put("/faq/hidden", async (req, res) => {
  await requireAdmin(req)
  const question = text(req.body?.question)
  if (!question) throw new HttpError(400, "질문을 골라 주세요.")
  const database = getDatabase()
  const faq = (database.faq ??= { added: [], hidden: [] })
  faq.hidden = req.body?.hidden ? [...new Set([...faq.hidden, question])] : faq.hidden.filter((item) => item !== question)
  logAdmin(database, "faq-changed", { kind: "site", id: "faq" }, question)
  await saveDatabase()
  res.json(faq)
})

// The analysis screen: the funnel, cohorts, where members are, this month
// against the targets, and what people search for.
adminMoreRouter.get("/insights", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  res.json({
    funnel: funnel(database),
    cohorts: cohorts(database),
    distribution: distribution(database),
    kpi: monthKpi(database),
    searches: topSearches(database),
  })
})

const target = (value: unknown) => {
  if (value === null || value === undefined || value === "") return undefined
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 1_000_000_000) throw new HttpError(400, "목표는 0 이상의 정수로 적어 주세요.")
  return number
}

adminMoreRouter.put("/settings/kpi", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const kpi = { signups: target(req.body?.signups), proposals: target(req.body?.proposals), revenue: target(req.body?.revenue) }
  database.settings = { ...database.settings, kpi: Object.fromEntries(Object.entries(kpi).filter(([, value]) => value !== undefined)) }
  logAdmin(database, "settings-changed", { kind: "site", id: "kpi" })
  await saveDatabase()
  res.json({ kpi: monthKpi(database) })
})

// Maintenance: on with a message, and whether new sign-ups stop.
adminMoreRouter.put("/settings/maintenance", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const message = text(req.body?.message).slice(0, 200)
  database.settings = {
    ...database.settings,
    maintenance: { on: Boolean(req.body?.on), ...(message ? { message } : {}), blockSignups: Boolean(req.body?.blockSignups) },
  }
  logAdmin(database, "settings-changed", { kind: "site", id: "maintenance" }, `${req.body?.on ? "점검 켬" : "점검 끔"}${req.body?.blockSignups ? " · 가입 막음" : ""}`)
  await saveDatabase()
  res.json({ maintenance: database.settings.maintenance })
})

// The system screen: the request limits, the backups kept, the reminders'
// runs and the maintenance switch.
adminMoreRouter.get("/system", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  res.json({
    limits: await limitStatus(),
    backups: await currentStorage().listBackups(),
    cronRuns: [...(database.cronRuns ?? [])].reverse(),
    maintenance: database.settings?.maintenance ?? { on: false, blockSignups: false },
  })
})

// One backup in full, as the file it was kept as. It holds every member's
// data, so only the console asks for it.
adminMoreRouter.get("/backups/:hour", async (req, res) => {
  await requireAdmin(req)
  const hour = String(req.params.hour)
  const data = await currentStorage().readBackup(hour)
  if (!data) throw new HttpError(404, "백업을 찾을 수 없어요.")
  res.setHeader("Content-Disposition", `attachment; filename="uniconnect-backup-${hour}.json"`)
  res.type("application/json").send(data)
})
