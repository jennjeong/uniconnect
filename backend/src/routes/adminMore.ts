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
import { config } from "../config.js"
import { backupSummary, backupWithoutSecrets, cleanTags, keepThroughRestore, grantPartners, logAdmin, resetExamples } from "../lib/adminTools.js"
import { applicationFolder, applicationsOf } from "../lib/applications.js"
import { sendMail } from "../lib/mailer.js"
import { photos, photoType } from "../lib/photos.js"
import { approveReferralReward, referralRewardsOf, rejectReferralReward, tellReferrers, waitingReferralRewards } from "../lib/referrals.js"
import { linkShop, tellInviters } from "../lib/shopInvites.js"
import { memberDetail } from "../lib/console.js"
import { HttpError } from "../lib/errors.js"
import { grantGroupCheck } from "../lib/groupCheck.js"
import { notify } from "../lib/notices.js"
import { limitStatus } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { currentStorage } from "../lib/storage.js"
import { text } from "../lib/validation.js"
import { getDatabase, restoreDatabase, saveDatabase, upgradeDatabase } from "../store.js"
import type { Account, Database, FaqEntry } from "../types.js"
import { requireAdmin } from "./admin.js"

// 운영자 콘솔의 나머지(pages/AdminMore.tsx)다. 회원 도구, 협찬 운영, 콘텐츠,
// 분석, 시스템을 다룬다. 모든 경로에 ADMIN_TOKEN이 필요하고, 모든 변경이
// 운영자 로그에 남는다.
export const adminMoreRouter = Router()

const accountFor = (database: Database, id: string) => {
  const account = database.accounts.find((item) => item.id === id)
  if (!account) throw new HttpError(404, "회원을 찾을 수 없어요.")
  return account
}

const endSessions = (database: Database, account: Account) => {
  database.sessions = database.sessions.filter((session) => session.accountId !== account.id)
}

// 결정을 기다리는 가입을 오래된 것부터 보여 준다(lib/applications.ts).
// 비밀번호는 절대 담지 않는다.
adminMoreRouter.get("/applications", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  res.json({
    applications: applicationsOf(database).map(({ id, kind, name, email, document, membership, representative, requestedAt, account, accountId, linkAccountId, invite }) => ({
      id,
      kind,
      name,
      email,
      document: { name: document.name, size: document.size },
      requestedAt,
      ...(account ? { brand: account.name, contact: account.contact } : {}),
      ...(linkAccountId && kind !== "group" ? { brand: name } : {}),
      // 대표자 이름과 학교를 서류와 맞춰 본다.
      ...(kind === "group"
        ? {
            group: name,
            representative,
            school: database.accounts.find((item) => item.id === linkAccountId)?.school ?? "",
            membership: membership && { name: membership.name, size: membership.size },
          }
        : {}),
      // 어느 가게를 잇는지 보고 서류와 맞춰 본다.
      ...(invite ? { placeUrl: database.invites.find((item) => item.code === invite)?.placeUrl } : {}),
      ...(accountId ? { team: database.accounts.find((item) => item.id === accountId)?.name ?? "" } : {}),
    })),
  })
})

const applicationById = (database: Database, id: string) => {
  const application = applicationsOf(database).find((item) => item.id === id)
  if (!application) throw new HttpError(404, "가입 신청을 찾을 수 없어요.")
  return application
}

adminMoreRouter.get("/applications/:id/document", async (req, res) => {
  await requireAdmin(req)
  const { id, document, membership } = applicationById(getDatabase(), req.params.id)
  // 학생단체 확인은 서류가 둘이다. ?part=membership이면 단체 소속 증빙이다.
  const chosen = req.query.part === "membership" ? membership : document
  if (!chosen) throw new HttpError(404, "서류를 찾을 수 없어요.")
  const bytes = await photos().get(applicationFolder(id), chosen.file)
  if (!bytes) throw new HttpError(404, "서류를 찾을 수 없어요.")
  res.type(photoType(chosen.file)).set("Cache-Control", "no-store").send(bytes)
})

// 답을 보낸다. 메일이 실패해도 결정을 되돌리지 않는다.
async function tellApplicant(email: string, subject: string, line: string) {
  try {
    await sendMail(email, subject, [line, ...(config.siteUrl ? [config.siteUrl] : [])].join("\n"))
  } catch {
    // 신청한 사람은 다음 로그인 때 알게 된다.
  }
}

// 승인하면 계정이나 공동 관리자가 실제로 만들어지고, 서류는 어느 쪽이든 지운다.
adminMoreRouter.post("/applications/:id/approve", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const application = applicationById(database, req.params.id)
  if (application.kind === "group") {
    const group = accountFor(database, application.linkAccountId ?? "")
    group.groupVerified = grantGroupCheck()
    database.applications = applicationsOf(database).filter((item) => item !== application)
    logAdmin(database, "group-verified", { kind: "account", id: group.id })
    await saveDatabase()
    await photos().removeAll([applicationFolder(application.id)])
    void notify(group, "account", "학생단체 확인이 끝났어요", ["서류를 확인했어요. 단체 카드와 상세 정보에 확인 표시가 붙어요. 제출한 서류는 지웠어요."], "/me")
    res.json({ ok: true })
    return
  }
  let link: ReturnType<typeof linkShop> | undefined
  if (application.account) {
    const { account } = application
    database.accounts.push(account)
    database.events[account.id] = []
    database.proposals[account.id] = []
    const invite = database.invites.find((item) => item.code === application.invite)
    const taken = invite && database.brands.some((brand) => brand.kakaoPlaceId === invite.placeId)
    if (invite && !taken) link = linkShop(database, account, invite)
  } else if (application.linkAccountId) {
    const invite = database.invites.find((item) => item.code === application.invite)
    if (!invite) throw new HttpError(409, "초대가 없어져서 연결할 수 없어요. 거절해 주세요.")
    link = linkShop(database, accountFor(database, application.linkAccountId), invite)
  } else {
    const account = accountFor(database, application.accountId ?? "")
    account.members = [...(account.members ?? []), application.member!]
  }
  database.applications = applicationsOf(database).filter((item) => item !== application)
  logAdmin(database, "application-approved", { kind: "account", id: application.account?.id ?? application.accountId ?? "" }, application.email)
  await saveDatabase()
  await photos().removeAll([applicationFolder(application.id)])
  if (link) tellInviters(database, link.brand, link.answered)
  await tellApplicant(
    application.email,
    "[uniconnect] 가입이 승인되었어요",
    application.linkAccountId
      ? "서류를 확인했어요. 가게를 연결했어요."
      : application.account
        ? "서류를 확인했어요. 이제 가입한 이메일과 비밀번호로 로그인할 수 있어요."
        : "서류를 확인했어요. 첫 로그인에서 2단계 인증을 설정하면 함께 관리할 수 있어요.",
  )
  res.json({ ok: true })
})

// 거절하면 모두 없애고 이유를 메일에 담는다.
adminMoreRouter.post("/applications/:id/reject", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const application = applicationById(database, req.params.id)
  const reason = text(req.body?.reason)
  if (!reason || reason.length > 200) throw new HttpError(400, "거절 사유를 200자 이하로 적어 주세요.")
  database.applications = applicationsOf(database).filter((item) => item !== application)
  logAdmin(database, "application-rejected", { kind: "account", id: application.account?.id ?? application.accountId ?? application.linkAccountId ?? "" }, application.email)
  await saveDatabase()
  await photos().removeAll([applicationFolder(application.id)])
  if (application.kind === "group") {
    const group = database.accounts.find((item) => item.id === application.linkAccountId)
    void notify(group, "account", "학생단체 확인을 마치지 못했어요", ["제출한 서류를 확인하지 못했어요. 서류는 지웠고, 다시 신청할 수 있어요.", `사유: ${reason}`], "/me")
  } else {
    await tellApplicant(application.email, "[uniconnect] 가입을 승인하지 못했어요", `제출한 서류를 확인하지 못했어요. 사유: ${reason}`)
  }
  res.json({ ok: true })
})

// 친구 초대 보상: Growth 일수는 운영자가 승인해야 나간다(lib/referrals.ts).
adminMoreRouter.get("/referrals", async (req, res) => {
  await requireAdmin(req)
  res.json({ rewards: waitingReferralRewards(getDatabase()) })
})

function waitingReward(database: Database, id: unknown) {
  const reward = referralRewardsOf(database).find((item) => item.id === id)
  if (!reward) throw new HttpError(404, "찾을 수 없는 보상이에요.")
  if (reward.status !== "waiting") throw new HttpError(409, "이미 결정한 보상이에요.")
  return reward
}

adminMoreRouter.post("/referrals/:id/approve", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const reward = waitingReward(database, req.params.id)
  const told = approveReferralReward(database, reward)
  logAdmin(database, "referral-approved", { kind: "account", id: reward.referrerId })
  await saveDatabase()
  tellReferrers([told])
  res.json({ ok: true })
})

adminMoreRouter.post("/referrals/:id/reject", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const reward = waitingReward(database, req.params.id)
  const reason = text(req.body?.reason)
  if (!reason || reason.length > 200) throw new HttpError(400, "거절 사유를 200자 이하로 적어 주세요.")
  rejectReferralReward(reward)
  logAdmin(database, "referral-rejected", { kind: "account", id: reward.referrerId }, reason)
  await saveDatabase()
  res.json({ ok: true })
})

// 회원을 정지하지 않고 모든 곳에서 로그아웃시킨다.
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

// 여러 회원에게 한 번에 하는 일이다. 정지, 로그아웃, 태그 추가나 빼기를
// 한다. 데모 계정은 정지에서 건너뛴다.
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

// 브랜드의 사업자를 직접 확인한 것으로 표시하거나(국세청 확인에 닿을 수 없을
// 때) 표시를 뗀다.
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

// 학생단체의 확인 표시를 뗀다. 붙이는 것은 서류를 본 승인으로만 한다.
adminMoreRouter.delete("/accounts/:id/group-verified", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const account = accountFor(database, String(req.params.id))
  const reason = text(req.body?.reason)
  if (!reason || reason.length > 200) throw new HttpError(400, "이유를 200자 이하로 적어 주세요.")
  if (!account.groupVerified) throw new HttpError(409, "확인 표시가 없는 단체예요.")
  delete account.groupVerified
  logAdmin(database, "group-unverified", { kind: "account", id: account.id }, reason)
  await saveDatabase()
  void notify(account, "account", "학생단체 확인 표시가 빠졌어요", ["운영자가 확인 표시를 뺐어요.", `사유: ${reason}`], "/me")
  res.json({ account: memberDetail(database, account) })
})

// 회원에게 Growth를 1일에서 365일 동안 무료로 준다.
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

// 시연 전에 예시 데이터를 시드대로 되돌린다.
adminMoreRouter.post("/demo/reset", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const leftovers = await resetExamples(database)
  upgradeDatabase(database)
  logAdmin(database, "demo-reset", { kind: "site", id: "demo" })
  await saveDatabase()
  // 초기화는 끝났으므로 파일을 못 지워도 실패로 답하지 않는다.
  await photos().removeAll(leftovers).catch((error: Error) => console.error(`[demo reset] ${error.message}`))
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

// 회원이 기다리는 제안을 알려 준다. 사흘에 한 번만이다.
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
    // 새 제안 메일과 같은 화면이다(브랜드의 받은 제안은 /inbox, 단체는 /offers).
    to.role === "브랜드" ? "/inbox" : "/offers",
  )
  res.json({ ok: true })
})

// 모든 계약을 진행 상황과 함께 최근에 바뀐 것부터 보여 준다.
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

// 진행 중인 행사와 어느 행사에서든 이상해 보이는 것을 보여 준다.
adminMoreRouter.get("/live", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  res.json({ events: liveEvents(database), alerts: fieldAlerts(database) })
})

// 모든 게시판 글을 올린 사람과 함께 최신순으로 보여 준다.
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

// 모든 후기를 누구에 대한 것인지와 함께 최신순으로 보여 준다.
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

// 질문을 누가 맡는지와 무언가를 기다리는지 보여 준다.
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

// 기본으로 들어 있는 질문 하나를(한국어 문구로 찾는다) 숨기거나 다시 보인다.
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

// 분석 화면이다. 퍼널, 코호트, 회원이 있는 곳, 이번 달과 목표의 비교,
// 사람들이 검색하는 것을 보여 준다.
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

// 점검이다. 메시지와 함께 켜며, 새 가입을 멈출지도 정한다.
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

// 시스템 화면이다. 요청 제한, 보관 중인 백업, 알림의 실행 기록, 점검 스위치를
// 보여 준다.
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

// 백업 하나를 비밀값을 뺀 파일로 준다. 모든 회원의 데이터가 들어 있으므로 콘솔만
// 요청하고, 누가 받았는지 남긴다.
adminMoreRouter.get("/backups/:hour", async (req, res) => {
  await requireAdmin(req)
  const hour = String(req.params.hour)
  const data = await currentStorage().readBackup(hour)
  if (!data) throw new HttpError(404, "백업을 찾을 수 없어요.")
  logAdmin(getDatabase(), "backup-downloaded", { kind: "backup", id: hour })
  await saveDatabase()
  res.setHeader("Content-Disposition", `attachment; filename="uniconnect-backup-${hour}.json"`)
  res.type("application/json").send(backupWithoutSecrets(data))
})

// 복원하기 전에 백업과 지금 데이터의 건수를 비교해 본다.
adminMoreRouter.get("/backups/:hour/summary", async (req, res) => {
  await requireAdmin(req)
  const data = await currentStorage().readBackup(String(req.params.hour))
  if (!data) throw new HttpError(404, "백업을 찾을 수 없어요.")
  res.json(backupSummary(data, getDatabase()))
})

// 백업으로 데이터를 되돌린다. 되돌릴 수 없는 일이라 몇 시 백업인지 다시 적어 보내야 한다.
// 사진, 참여 기록 행, 결제, 운영자는 되돌리지 않는다(`keepThroughRestore`).
adminMoreRouter.post("/backups/:hour/restore", async (req, res) => {
  await requireAdmin(req)
  const hour = String(req.params.hour)
  if (text(req.body?.confirm) !== hour) throw new HttpError(400, "복원할 백업의 시각을 그대로 적어 주세요.")
  const data = await currentStorage().readBackup(hour)
  if (!data) throw new HttpError(404, "백업을 찾을 수 없어요.")
  const summary = backupSummary(data, getDatabase())
  await restoreDatabase(data, keepThroughRestore)
  logAdmin(getDatabase(), "backup-restored", { kind: "backup", id: hour })
  await saveDatabase()
  res.json(summary)
})
