import { randomUUID } from "node:crypto"

import { config } from "../config.js"
import { createSeed } from "../data/seed.js"
import { cardReady, paymentsOf, testMode } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { proUntil } from "./plan.js"
import type { Account, AdminAction, AdminLogEntry, Announcement, Database, Payment } from "../types.js"

// 콘솔은 최근 항목만 둔다.
export const adminLogLimit = 500

// 운영자가 한 일을 id만으로 기록한다.
export function logAdmin(
  database: Database,
  action: AdminAction,
  target: AdminLogEntry["target"],
  detail?: string,
  now = new Date(),
) {
  const log = (database.adminLog ??= [])
  log.push({ id: randomUUID(), at: now.toISOString(), action, target, ...(detail ? { detail } : {}) })
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
    return undefined
  }
  return [...(database.adminLog ?? [])].reverse().map((entry) => ({ ...entry, label: label(entry.target) ?? null }))
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

// 회원에게 며칠간 요금 없이 캠퍼스 파트너스를 준다. 지원금으로 표시한
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
    orderName: `캠퍼스 파트너스 ${days}일 (${reason})`,
    amount: 0,
    status: "paid",
    method: "grant",
    requestedAt: now.toISOString(),
    paidAt: now.toISOString(),
    periodEnd: addDays(from, days - 1),
  } as Payment
  ;(database.payments ??= []).push(payment)
  return payment
}

// 예시 데이터를 시드대로 되돌린다: 데모 계정 자신의 기록과 시드 카탈로그,
// 제안, 대화, 후기, 게시물. 회원의 데이터는 그대로 두고 데모 계정은
// 세션을 유지한다.
export async function resetExamples(database: Database) {
  const fresh = await createSeed()
  const demo = new Set(Object.values(fresh.demoAccountIds))
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
}

// 콘솔이 세는 검색어: 소문자, 단어 사이 공백 하나, 두 글자에서 서른 글자.
export function searchTerm(value: unknown) {
  const term = String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim()
  return term.length >= 2 && term.length <= 30 ? term : null
}

// 검색어를 세고 가장 많이 검색된 300개를 둔다.
export function countSearch(database: Database, term: string) {
  const terms = (database.searchTerms ??= {})
  terms[term] = (terms[term] ?? 0) + 1
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
