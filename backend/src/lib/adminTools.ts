import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"

import { config } from "../config.js"
import { createSeed } from "../data/seed.js"
import { cardReady, paymentsOf, testMode } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { chatFiles, eventPhotos } from "./photos.js"
import { proUntil } from "./plan.js"
import type { Account, AdminAction, AdminLogEntry, Announcement, Database, Payment } from "../types.js"

// 콘솔은 최근 항목만 둔다.
export const adminLogLimit = 500

// 이 요청을 누가 하는지다. /api/admin의 요청마다 한 칸을 만들고(app.ts), 인증이
// 채운다. 기록하는 곳마다 넘기지 않아도 모든 기록에 행위자가 남는다.
export const adminRequest = new AsyncLocalStorage<{ actor?: string }>()

// 운영자가 한 일을 id만으로 기록한다.
export function logAdmin(
  database: Database,
  action: AdminAction,
  target: AdminLogEntry["target"],
  detail?: string,
  now = new Date(),
) {
  const log = (database.adminLog ??= [])
  const actor = adminRequest.getStore()?.actor
  log.push({ id: randomUUID(), at: now.toISOString(), ...(actor ? { actor } : {}), action, target, ...(detail ? { detail } : {}) })
  if (log.length > adminLogLimit) log.splice(0, log.length - adminLogLimit)
}

// 새것부터 본 기록. 대상마다 지금의 이름을 붙인다(탈퇴한 회원은 이름
// 없이 나온다).
export function adminLogRows(database: Database) {
  const label = (target: AdminLogEntry["target"]) => {
    if (target.kind === "account") return database.accounts.find((account) => account.id === target.id)?.name
    if (target.kind === "payment") return database.payments?.find((payment) => payment.id === target.id)?.orderName
    if (target.kind === "inquiry") return database.inquiries.find((inquiry) => inquiry.id === target.id)?.category
    if (target.kind === "announcement") return database.announcements?.find((item) => item.id === target.id)?.text.slice(0, 40)
    if (target.kind === "dispute") return database.disputes?.find((item) => item.id === target.id)?.eventName
    return undefined
  }
  const actorName = (actor?: string) => database.operators?.find((operator) => operator.id === actor)?.name ?? null
  return [...(database.adminLog ?? [])]
    .reverse()
    .map((entry) => ({ ...entry, label: label(entry.target) ?? null, actorName: actorName(entry.actor) }))
}

// 내려받는 백업에서 뺄 값이다. 로그인, 결제, 현장 확인에 쓸 수 있는 것들이다.
// 데이터베이스 안의 백업에는 그대로 있어 복원할 수 있고, 내려받은 파일이 새도
// 계정을 넘겨주지는 않는다.
const secretKeys = new Set([
  "passwordHash",
  "twoFactor",
  "pendingTwoFactor",
  "loginTicket",
  "calendarFeed",
  "councilCode",
  "paymentKey",
  "customerKey",
  "token",
  "tokenHash",
  "codeHash",
  "shareToken",
  "verificationToken",
  "staffPin",
  "groupPin",
  "sessions",
  "emailCodes",
  "oauth",
  "operators",
  "operatorSessions",
])

// 백업에서 되돌리지 않는 것을 현재 데이터에서 옮긴다. 운영자와 그 세션이 되돌아가면 복원한
// 사람이 잠길 수 있고, 결제는 Toss에 이미 일어난 일이다. 회원 세션도 지금 것을 두어 로그아웃한
// 기기가 되살아나지 않게 하며, 집계 기록도 두어 같은 스캔을 두 번 세지 않는다.
export function keepThroughRestore(current: Database, restored: Database) {
  const accounts = new Set(restored.accounts.map((account) => account.id))
  restored.operators = current.operators
  restored.operatorSessions = current.operatorSessions
  restored.payments = current.payments
  // 분쟁은 기록이라 되돌리지 않는다. 증빙 파일도 복원되지 않는다.
  restored.disputes = current.disputes
  restored.sessions = current.sessions.filter((session) => accounts.has(session.accountId))
  restored.foldedCounts = current.foldedCounts
  restored.adminLog = current.adminLog
  // 쓴 재설정 코드와 끝난 소셜 로그인이 되살아나지 않게 한다.
  restored.emailCodes = current.emailCodes
  restored.oauth = current.oauth
  for (const account of restored.accounts) {
    const now = current.accounts.find((item) => item.id === account.id)
    if (now) keepAccountSecurity(account, now, restored)
  }
  // 멈춘 리포트 공유 링크도 다시 열리지 않는다.
  for (const [accountId, list] of Object.entries(restored.sponsorships)) {
    for (const sponsorship of list) {
      const now = current.sponsorships[accountId]?.find((item) => item.id === sponsorship.id)
      if (!now) continue
      if (now.shareToken) sponsorship.shareToken = now.shareToken
      else delete sponsorship.shareToken
    }
  }
}

// 복원은 데이터를 되돌리는 일이지 보안 조치를 되돌리는 일이 아니다. 빼앗긴 계정의 비밀번호
// 재설정, 계정 정지, 팀원 제거, 멈춘 공개 링크는 백업 시점으로 돌아가지 않는다.
const securityFields = [
  "passwordHash",
  "twoFactor",
  "pendingTwoFactor",
  "loginTicket",
  "suspendedAt",
  "members",
  "memberInvites",
  "social",
  "calendarFeed",
  "groupVerified",
] as const

function keepAccountSecurity(account: Account, now: Account, restored: Database) {
  const target = account as unknown as Record<string, unknown>
  for (const field of securityFields) {
    if (now[field] === undefined) delete target[field]
    else target[field] = now[field]
  }
  // 이메일을 옮긴 계정은 옛 주소로 돌아가지 않는다. 지금 주소가 복원되는 다른 계정의 것이면
  // 둘 다 로그인할 수 있도록 백업의 주소를 둔다.
  if (!restored.accounts.some((item) => item !== account && item.email === now.email)) account.email = now.email
  if (account.ledger) {
    if (now.ledger?.token) account.ledger.token = now.ledger.token
    else delete account.ledger.token
  }
}

// 백업이 복원할 수 있는 모양인지와, 지금과 얼마나 다른지다.
export function backupSummary(data: string, current: Database) {
  let backup: Partial<Database>
  try {
    backup = JSON.parse(data) as Partial<Database>
  } catch {
    throw new HttpError(409, "이 백업은 손상되어 복원할 수 없어요.")
  }
  if (!Array.isArray(backup.accounts) || !Array.isArray(backup.measurements) || typeof backup.events !== "object" || backup.events === null) {
    throw new HttpError(409, "이 백업은 손상되어 복원할 수 없어요.")
  }
  const countsOf = (database: Partial<Database>) => ({
    accounts: database.accounts?.length ?? 0,
    events: Object.values(database.events ?? {}).reduce((sum, list) => sum + list.length, 0),
    measurements: database.measurements?.length ?? 0,
    proposals: (database.requests?.length ?? 0) + (database.offers?.length ?? 0),
  })
  // 탈퇴 등으로 지금은 없지만 복원하면 돌아오는 계정이다. 복원 전에 알 수 있게 한다.
  const here = new Set(current.accounts.map((account) => account.id))
  const accountsBack = backup.accounts.filter((account) => !here.has(account.id)).length
  return { backup: countsOf(backup), current: countsOf(current), accountsBack }
}

export function backupWithoutSecrets(data: string) {
  return JSON.stringify(JSON.parse(data), (key, value: unknown) => (secretKeys.has(key) ? undefined : value))
}

// 탈퇴하는 회원에 대해 운영자가 남긴 것을 지운다: 메모, 태그, 기록 항목,
// 회원이 한 문의의 처리.
export function forgetAdminRecords(database: Database, accountId: string) {
  if (database.adminNotes) delete database.adminNotes[accountId]
  if (database.adminTags) delete database.adminTags[accountId]
  if (database.inquiryHandling) {
    const asked = new Set(database.inquiries.map((inquiry) => inquiry.id))
    for (const id of Object.keys(database.inquiryHandling)) if (!asked.has(id)) delete database.inquiryHandling[id]
  }
  if (database.adminLog) {
    database.adminLog = database.adminLog.filter((entry) => !(entry.target.kind === "account" && entry.target.id === accountId))
  }
}

export const noteLimit = 1000

// 공지가 오늘 보이는지: 내려지지 않았고 첫날과 마지막 날 사이다.
export const isLive = (item: Announcement, today = todayInKorea()) =>
  !item.endedAt && (!item.from || item.from <= today) && (!item.until || item.until >= today)

// 보는 사람 하나가 보는 공지: 모두에게 보내는 것과 로그인하면 그 쪽의 것.
export function liveAnnouncements(database: Database, account?: Account) {
  return (database.announcements ?? [])
    .filter((item) => isLive(item))
    .filter((item) => item.audience === "all" || item.audience === account?.role)
    .map(({ id, text, tone }) => ({ id, text, tone }))
}

// API의 이 복사본이 어떤 서비스에 맞춰 설정됐는지. 값은 담지 않는다.
// 운영자가 아니면 Vercel 설정에서 확인해야 하는 것이다.
export function serviceHealth() {
  const on = (value: unknown) => Boolean(value)
  return {
    storage: config.databaseUrl ? ("postgres" as const) : ("file" as const),
    secretsSealed: Boolean(config.secretsKey),
    payments: cardReady() ? (testMode() ? ("test" as const) : ("live" as const)) : ("off" as const),
    checks: [
      { key: "mail", on: on(config.resendApiKey && config.mailFrom) },
      { key: "siteUrl", on: on(config.siteUrl) },
      { key: "operatorEmail", on: on(config.operatorEmail) },
      { key: "cron", on: on(config.cronSecret) },
      { key: "kakaoLocal", on: on(config.kakaoRestApiKey) },
      { key: "kakaoLogin", on: on(config.kakaoClientId) },
      { key: "naverLogin", on: on(config.naverClientId && config.naverClientSecret) },
      { key: "geocoder", on: on(config.nominatimUrl) },
      { key: "youtube", on: on(config.youtubeApiKey) },
      { key: "nts", on: on(config.ntsServiceKey) },
    ],
    vercel: Boolean(process.env.VERCEL),
    region: process.env.VERCEL_REGION ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  }
}

// 회원의 태그를 다듬는다: 앞뒤 공백 제거, 짧게, 중복 없이, 최대 열 개.
export function cleanTags(values: unknown) {
  const list = Array.isArray(values) ? values : []
  return [...new Set(list.map((value) => String(value).trim().slice(0, 20)).filter(Boolean))].slice(0, 10)
}

export const tagsOf = (database: Database, accountId: string) => database.adminTags?.[accountId] ?? []

// 회원에게 며칠간 요금 없이 Growth를 준다. 지원금으로 표시한
// 0원 결제 주문이며 이미 가진 기간 뒤에 이어 붙인다.
export function grantPartners(database: Database, account: Account, days: number, now = new Date(), reason = "운영자 부여") {
  const until = proUntil(database, account.id)
  const from = until ? addDays(until, 1) : todayInKorea(now)
  const payment: Payment = {
    id: `grant-${randomUUID()}`,
    accountId: account.id,
    accountName: account.name,
    kind: "pro",
    targetId: "",
    orderName: `Growth ${days}일 (${reason})`,
    amount: 0,
    status: "paid",
    method: "grant",
    requestedAt: now.toISOString(),
    paidAt: now.toISOString(),
    periodEnd: addDays(from, days - 1),
    periodDays: days,
  } as Payment
  ;(database.payments ??= []).push(payment)
  return payment
}

// 예시 데이터를 시드대로 되돌린다: 데모 계정 자신의 기록과 시드 카탈로그,
// 제안, 대화, 후기, 게시물. 회원의 데이터는 그대로 두고 데모 계정은
// 세션을 유지한다. 데모 계정의 행사와 함께 사라진 계약서, 대화의 파일을 지우도록
// 그 파일 묶음의 이름을 돌려준다(저장한 뒤에 지운다).
export async function resetExamples(database: Database) {
  const fresh = await createSeed()
  const demo = new Set(Object.values(fresh.demoAccountIds))
  const before = {
    events: [...demo].flatMap((id) => (database.events[id] ?? []).map((event) => event.id)),
    agreements: database.agreements.map((item) => item.id),
    conversations: database.conversations.map((item) => item.id),
  }
  const exampleListings = new Set([...fresh.brands, ...fresh.groups].map((listing) => listing.id))
  const freshAccounts = new Map(fresh.accounts.map((account) => [account.id, account]))
  database.accounts = database.accounts.filter((account) => !demo.has(account.id)).concat(fresh.accounts.map((account) => {
    const kept = database.accounts.find((item) => item.id === account.id)
    return kept ? { ...freshAccounts.get(account.id)!, passwordHash: kept.passwordHash } : account
  }))
  database.demoAccountIds = fresh.demoAccountIds
  database.brands = database.brands.filter((listing) => !exampleListings.has(listing.id)).concat(fresh.brands)
  database.groups = database.groups.filter((listing) => !exampleListings.has(listing.id)).concat(fresh.groups)
  const example = (item: { fromAccountId?: string }) => !item.fromAccountId || demo.has(item.fromAccountId)
  database.requests = database.requests.filter((item) => !example(item) && !exampleListings.has(item.brandId)).concat(fresh.requests)
  database.offers = database.offers.filter((item) => !example(item) && !exampleListings.has(item.groupId)).concat(fresh.offers)
  const proposals = new Set([...database.requests, ...database.offers].map((item) => item.id))
  database.agreements = database.agreements.filter((item) => proposals.has(item.id))
  database.conversations = database.conversations
    .filter((item) => !exampleListings.has(item.brandId) && !exampleListings.has(item.groupId))
    .concat(fresh.conversations)
  database.reviews = database.reviews.filter((item) => proposals.has(item.proposalId) && !exampleListings.has(item.aboutId)).concat(fresh.reviews)
  database.posts = database.posts.filter((item) => !demo.has(item.accountId)).concat(fresh.posts)
  database.measurements = database.measurements.filter((item) => !demo.has(item.accountId)).concat(fresh.measurements)
  for (const id of demo) {
    delete database.localCampaigns?.[id]
    database.events[id] = fresh.events[id] ?? []
    database.proposals[id] = fresh.proposals[id] ?? []
    if (fresh.sponsorships[id]) database.sponsorships[id] = fresh.sponsorships[id]
    else delete database.sponsorships[id]
    delete database.saved[id]
    delete database.blocks[id]
  }
  database.inquiries = database.inquiries.filter((item) => !demo.has(item.accountId))
  database.invites = database.invites.filter((item) => !demo.has(item.accountId))
  database.payments = paymentsOf(database).filter((item) => !demo.has(item.accountId))
  const agreements = new Set(database.agreements.map((item) => item.id))
  const conversations = new Set(database.conversations.map((item) => item.id))
  return [
    // 시드 행사에는 올린 파일이 없으므로 데모 행사의 파일은 모두 지운다.
    ...before.events.map(eventPhotos),
    ...before.agreements.filter((id) => !agreements.has(id)),
    ...before.conversations.filter((id) => !conversations.has(id)).map(chatFiles),
  ]
}

// 콘솔이 세는 검색어: 소문자, 단어 사이 공백 하나, 두 글자에서 서른 글자.
export function searchTerm(value: unknown) {
  const term = String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim()
  return term.length >= 2 && term.length <= 30 ? term : null
}

// 검색어를 세고 가장 많이 검색된 300개를 둔다.
export function countSearch(database: Database, term: string) {
  const terms = (database.searchTerms ??= {})
  // "constructor" 같은 검색어가 객체에 물려받은 값을 읽지 않게 한다.
  terms[term] = (Object.hasOwn(terms, term) ? terms[term] : 0) + 1
  const entries = Object.entries(terms)
  if (entries.length > 300) {
    database.searchTerms = Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, 250))
  }
}

// 방문자에게 보이는 사이트의 스위치.
export function siteState(database: Database) {
  const maintenance = database.settings?.maintenance
  return {
    maintenance: maintenance?.on ? { message: maintenance.message ?? "" } : null,
    signupsClosed: Boolean(maintenance?.blockSignups),
  }
}

// 날짜 알림 실행을 기록하고 최근 30개를 둔다.
export function noteCronRun(database: Database, sent: number, now = new Date()) {
  const runs = (database.cronRuns ??= [])
  runs.push({ at: now.toISOString(), sent })
  if (runs.length > 30) runs.splice(0, runs.length - 30)
}
