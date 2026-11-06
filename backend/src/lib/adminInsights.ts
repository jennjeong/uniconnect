import { paymentsOf } from "./billing.js"
import { addDays, todayInKorea } from "./dates.js"
import { campusOf, placeOf } from "./geo.js"
import { statusOf } from "./proposals.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Agreement, Database, SponsorOffer, SponsorRequest } from "../types.js"

// 운영자 콘솔이 분석 화면과 운영 화면(routes/adminMore.ts)을 위해 데이터로
// 계산하는 것. 분석은 실제 회원만 센다. 데모 계정과 시드는 뺀다.

const dayMs = 24 * 60 * 60 * 1000

const realAccounts = (database: Database) => database.accounts.filter((account) => !isDemoAccount(database, account))

// 리스팅을 가진 계정. 회원이 가졌을 때만 있다.
export const ownerOf = (database: Database, listingId: string | undefined) =>
  listingId ? database.accounts.find((account) => account.brandId === listingId || account.groupId === listingId) : undefined

const allProposals = (database: Database) => [...database.requests, ...database.offers]

// 제안이 간 곳: 요청이면 브랜드, 제안이면 단체.
export const recipientOf = (database: Database, proposal: SponsorRequest | SponsorOffer) =>
  ownerOf(database, "groupName" in proposal ? proposal.brandId : proposal.groupId)

const proposalName = (proposal: SponsorRequest | SponsorOffer) => ("eventName" in proposal ? proposal.eventName : proposal.campaignName)
const proposalDate = (proposal: SponsorRequest | SponsorOffer) => ("eventDate" in proposal ? proposal.eventDate : proposal.campaignDate)
const fromName = (database: Database, proposal: SponsorRequest | SponsorOffer) =>
  database.accounts.find((account) => account.id === proposal.fromAccountId)?.name ?? ("groupName" in proposal ? proposal.groupName : proposal.brandName)
const toName = (database: Database, proposal: SponsorRequest | SponsorOffer) =>
  "groupName" in proposal
    ? (database.brands.find((brand) => brand.id === proposal.brandId)?.name ?? "")
    : (database.groups.find((group) => group.id === proposal.groupId)?.name ?? "")

// 가입부터 결제까지의 단계. 단계마다 거기까지 간 회원 수를 센다(실제
// 회원만).
export function funnel(database: Database) {
  const members = realAccounts(database)
  const ids = new Set(members.map((account) => account.id))
  const listed = members.filter((account) => (account.role === "학생단체" ? database.groups : database.brands).some((item) => item.id === (account.groupId ?? account.brandId)))
  const proposers = new Set(allProposals(database).map((item) => item.fromAccountId).filter((id): id is string => Boolean(id && ids.has(id))))
  const accepted = new Set<string>()
  for (const proposal of allProposals(database)) {
    if (proposal.status !== "수락") continue
    if (proposal.fromAccountId && ids.has(proposal.fromAccountId)) accepted.add(proposal.fromAccountId)
    const to = recipientOf(database, proposal)
    if (to && ids.has(to.id)) accepted.add(to.id)
  }
  const payers = new Set(paymentsOf(database).filter((payment) => payment.status === "paid" && payment.method !== "grant" && ids.has(payment.accountId)).map((payment) => payment.accountId))
  return [
    { step: "가입", count: members.length },
    { step: "소개 작성", count: listed.length },
    { step: "첫 제안", count: proposers.size },
    { step: "첫 수락", count: accepted.size },
    { step: "첫 결제", count: payers.size },
  ]
}

// 날짜가 속한 주의 월요일, "YYYY-MM-DD".
const weekOf = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`)
  return addDays(day, -((date.getUTCDay() + 6) % 7))
}

// 가입한 주별 회원, 그리고 이후 각 주에 행사, 제안, 로그인 같은 활동을
// 하고 있는 비율.
export function cohorts(database: Database, now = new Date(), weeks = 8) {
  const today = todayInKorea(now)
  const thisWeek = weekOf(today)
  const activity = new Map<string, Set<string>>()
  const note = (accountId: string | undefined, at: string | number | undefined) => {
    if (!accountId || at === undefined) return
    const day = todayInKorea(new Date(at))
    let set = activity.get(accountId)
    if (!set) activity.set(accountId, (set = new Set()))
    set.add(weekOf(day))
  }
  for (const [accountId, events] of Object.entries(database.events)) for (const event of events) note(accountId, event.createdAt)
  for (const proposal of allProposals(database)) note(proposal.fromAccountId, proposal.createdAt)
  for (const session of database.sessions) {
    note(session.accountId, session.createdAt)
    note(session.accountId, session.lastUsedAt)
  }
  const rows = []
  for (let back = weeks - 1; back >= 0; back -= 1) {
    const week = addDays(thisWeek, -7 * back)
    const joined = realAccounts(database).filter((account) => weekOf(todayInKorea(new Date(account.createdAt))) === week)
    const active = [1, 2, 3, 4].map((later) => {
      const target = addDays(week, 7 * later)
      if (target > thisWeek) return null
      if (joined.length === 0) return 0
      return Math.round((joined.filter((account) => activity.get(account.id)?.has(target)).length / joined.length) * 100)
    })
    rows.push({ week, size: joined.length, active })
  }
  return rows
}

// 학교별(단체)과 업종별(브랜드) 회원. 많은 순.
export function distribution(database: Database) {
  const count = (values: string[]) =>
    Object.entries(values.reduce<Record<string, number>>((all, value) => ({ ...all, [value]: (all[value] ?? 0) + 1 }), {}))
      .map(([label, n]) => ({ label, count: n }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const members = realAccounts(database)
  return {
    schools: count(members.filter((account) => account.role === "학생단체").map((account) => account.school || "—")),
    industries: count(
      members
        .filter((account) => account.role === "브랜드")
        .map((account) => database.brands.find((brand) => brand.id === account.brandId)?.industry ?? "—"),
    ),
    types: count(members.map((account) => account.type)),
    map: memberMap(database),
  }
}

// 회원이 있는 곳: 단체는 캠퍼스별로 세고 브랜드는 매장 위치로 센다. 분석
// 화면의 지도에 쓴다. 위치를 모르는 회원은 뺀다.
function memberMap(database: Database) {
  const members = realAccounts(database)
  const groups = new Map<string, { name: string; lat: number; lng: number; count: number }>()
  for (const account of members.filter((item) => item.role === "학생단체")) {
    const campus = campusOf(account)
    if (!campus) continue
    const row = groups.get(campus.name) ?? { name: campus.name, lat: campus.lat, lng: campus.lng, count: 0 }
    row.count += 1
    groups.set(campus.name, row)
  }
  const brands = members
    .filter((account) => account.role === "브랜드")
    .map((account) => {
      const point = placeOf(database.brands.find((brand) => brand.id === account.brandId), account)
      return point ? { name: account.name, lat: point.lat, lng: point.lng } : undefined
    })
    .filter((item): item is { name: string; lat: number; lng: number } => Boolean(item))
  return { groups: [...groups.values()], brands }
}

// 이번 달 가입, 제안, 매출을 목표와 나란히 둔다.
export function monthKpi(database: Database, now = new Date()) {
  const month = todayInKorea(now).slice(0, 7)
  const inMonth = (at: string | undefined) => Boolean(at) && todayInKorea(new Date(at!)).slice(0, 7) === month
  const targets = database.settings?.kpi ?? {}
  const actual = {
    signups: realAccounts(database).filter((account) => inMonth(account.createdAt)).length,
    proposals: allProposals(database).filter((item) => item.fromAccountId && inMonth(item.createdAt)).length,
    revenue: paymentsOf(database)
      .filter((payment) => payment.status === "paid" && inMonth(payment.paidAt))
      .reduce((sum, payment) => sum + payment.amount, 0),
  }
  return (["signups", "proposals", "revenue"] as const).map((key) => ({ key, actual: actual[key], target: targets[key] ?? null }))
}

// 가장 많이 검색된 단어. 누가 검색했는지는 담지 않는다.
export const topSearches = (database: Database, limit = 30) =>
  Object.entries(database.searchTerms ?? {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }))

// `days`일이 지나도록 답을 기다리는 제안. 오래된 순.
export function staleProposals(database: Database, now = new Date(), days = 7) {
  const cutoff = now.getTime() - days * dayMs
  return allProposals(database)
    .filter((item) => item.fromAccountId && statusOf(database, item) === "검토 중" && Date.parse(item.createdAt) < cutoff)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((item) => ({
      id: item.id,
      from: fromName(database, item),
      to: toName(database, item),
      event: proposalName(item),
      createdAt: item.createdAt,
      waitingDays: Math.floor((now.getTime() - Date.parse(item.createdAt)) / dayMs),
      canNudge: Boolean(recipientOf(database, item)),
    }))
}

// 운영자용 제안 전체: 조건, 날짜, 계약서 진행, 행사 수치. 메시지는 넣지
// 않는다.
export function proposalDetail(database: Database, id: string) {
  const proposal = allProposals(database).find((item) => item.id === id)
  if (!proposal) return undefined
  const agreement = database.agreements.find((item) => item.id === id)
  const eventId = "groupName" in proposal ? proposal.eventId : proposal.campaignId
  const measurement = eventId ? database.measurements.find((item) => item.eventId === eventId) : undefined
  return {
    id,
    kind: "groupName" in proposal ? ("request" as const) : ("offer" as const),
    from: fromName(database, proposal),
    to: toName(database, proposal),
    event: proposalName(proposal),
    date: proposalDate(proposal),
    terms: "ask" in proposal ? proposal.ask : proposal.offer,
    status: statusOf(database, proposal),
    createdAt: proposal.createdAt,
    respondedAt: proposal.respondedAt ?? null,
    canceledAt: proposal.canceledAt ?? null,
    fromPost: Boolean(proposal.postId),
    agreement: agreement ? agreementRow(database, agreement) : null,
    metrics: measurement ? { scans: measurement.metrics.scans, coupons: measurement.metrics.coupons, visits: measurement.metrics.visits } : null,
  }
}

export type AgreementState = "draft" | "one" | "both" | "done" | "cancel"

// 계약서의 상태: 취소 요청됨, 완료(양쪽 확인에 모든 항목 완료), 양쪽 또는
// 한쪽 확인, 아직 아님.
export function agreementState(agreement: Agreement): AgreementState {
  if (agreement.cancel && !agreement.cancel.canceledAt) return "cancel"
  const sides = Object.keys(agreement.confirmed).length
  if (sides >= 2 && agreement.items.length > 0 && agreement.items.every((item) => item.doneAt)) return "done"
  return sides >= 2 ? "both" : sides === 1 ? "one" : "draft"
}

export function agreementRow(database: Database, agreement: Agreement) {
  const proposal = allProposals(database).find((item) => item.id === agreement.id)
  return {
    id: agreement.id,
    from: proposal ? fromName(database, proposal) : "",
    to: proposal ? toName(database, proposal) : "",
    event: proposal ? proposalName(proposal) : "",
    date: proposal ? proposalDate(proposal) : "",
    state: agreementState(agreement),
    done: agreement.items.filter((item) => item.doneAt).length,
    items: agreement.items.length,
    cancel: agreement.cancel && !agreement.cancel.canceledAt ? { by: agreement.cancel.by, reason: agreement.cancel.reason, at: agreement.cancel.requestedAt } : null,
    updatedAt: agreement.updatedAt,
    example: !proposal?.fromAccountId,
  }
}

// 모든 행사와 캠페인을 주인과 함께. 임박한 순.
export function allEvents(database: Database) {
  return Object.entries(database.events)
    .flatMap(([accountId, events]) => {
      const owner = database.accounts.find((account) => account.id === accountId)
      return events.map((event) => {
        const measurement = database.measurements.find((item) => item.eventId === event.id)
        return {
          id: event.id,
          name: event.name,
          date: event.date,
          endDate: event.endDate ?? null,
          owner: owner?.name ?? "",
          role: owner?.role ?? null,
          example: owner ? isDemoAccount(database, owner) : true,
          sponsors: measurement?.sponsors.length ?? 0,
          scans: measurement?.metrics.scans ?? 0,
        }
      })
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 오늘 열리는 행사(또는 어제 끝나 아직 세는 행사)와 현재 수치, 오늘의
// 시간대별 수치.
export function liveEvents(database: Database, now = new Date()) {
  const today = todayInKorea(now)
  return allEvents(database)
    .filter((event) => event.date <= today && addDays(event.endDate ?? event.date, 1) >= today)
    .map((event) => {
      const measurement = database.measurements.find((item) => item.eventId === event.id)
      const hours = (measurement?.hourlyScans ?? []).filter((item) => item.date === today)
      const last = measurement?.log.at(-1)
      return {
        ...event,
        coupons: measurement?.metrics.coupons ?? 0,
        visits: measurement?.metrics.visits ?? 0,
        hourly: hours.map(({ hour, scans }) => ({ hour, scans })),
        lastAt: last?.at ?? null,
        pinMisses: measurement?.pinMisses?.day === today ? measurement.pinMisses.count : 0,
      }
    })
}

// 행사에서 이상해 보이는 것: 오늘 틀린 PIN이 많음, 쿠폰보다 방문이 많음,
// 몇 분 안에 몰린 방문.
export function fieldAlerts(database: Database, now = new Date()) {
  const today = todayInKorea(now)
  const alerts: { eventId: string; event: string; kind: "pin" | "visits-over-coupons" | "visit-burst"; detail: string }[] = []
  for (const measurement of database.measurements) {
    const event = Object.values(database.events).flat().find((item) => item.id === measurement.eventId)
    const name = event?.name ?? database.localCampaigns?.[measurement.accountId]?.name ?? measurement.eventId
    if (measurement.pinMisses?.day === today && measurement.pinMisses.count >= 5) {
      alerts.push({ eventId: measurement.eventId, event: name, kind: "pin", detail: String(measurement.pinMisses.count) })
    }
    if (measurement.metrics.visits > measurement.metrics.coupons) {
      alerts.push({ eventId: measurement.eventId, event: name, kind: "visits-over-coupons", detail: `${measurement.metrics.visits}/${measurement.metrics.coupons}` })
    }
    const visits = measurement.log.filter((entry) => entry.kind === "visits").map((entry) => Date.parse(entry.at)).sort((a, b) => a - b)
    for (let index = 0; index + 7 < visits.length; index += 1) {
      if (visits[index + 7] - visits[index] <= 10 * 60 * 1000) {
        alerts.push({ eventId: measurement.eventId, event: name, kind: "visit-burst", detail: new Date(visits[index]).toISOString() })
        break
      }
    }
  }
  return alerts
}

// 가까운 순에서 초대한 가게: 초대 수, 가입 수, 초대한 쪽별.
export function inviteStats(database: Database) {
  const byInviter = new Map<string, { name: string; sent: number; joined: number }>()
  for (const invite of database.invites) {
    const name = database.accounts.find((account) => account.id === invite.accountId)?.name ?? "—"
    const row = byInviter.get(invite.accountId) ?? { name, sent: 0, joined: 0 }
    row.sent += 1
    if (invite.acceptedAt) row.joined += 1
    byInviter.set(invite.accountId, row)
  }
  const sent = database.invites.length
  const joined = database.invites.filter((invite) => invite.acceptedAt).length
  return {
    sent,
    joined,
    rate: sent === 0 ? null : Math.round((joined / sent) * 100),
    byInviter: [...byInviter.values()].sort((a, b) => b.sent - a.sent),
  }
}

// 회원에게 일어난 일을 순서대로: 가입, 행사, 보낸 제안과 받은 답, 계약서,
// 결제, 문의, 신고, 정지.
export function timeline(database: Database, account: Account) {
  const items: { at: string; kind: string; text: string }[] = [{ at: account.createdAt, kind: "가입", text: account.name }]
  for (const event of database.events[account.id] ?? []) if (event.createdAt) items.push({ at: event.createdAt, kind: "행사 등록", text: event.name })
  for (const proposal of allProposals(database)) {
    const mine = proposal.fromAccountId === account.id
    const toMe = recipientOf(database, proposal)?.id === account.id
    if (!mine && !toMe) continue
    items.push({ at: proposal.createdAt, kind: mine ? "제안 보냄" : "제안 받음", text: `${mine ? toName(database, proposal) : fromName(database, proposal)} · ${proposalName(proposal)}` })
    if (proposal.respondedAt) items.push({ at: proposal.respondedAt, kind: `제안 ${proposal.status}`, text: proposalName(proposal) })
    const agreement = database.agreements.find((item) => item.id === proposal.id)
    if (agreement && Object.keys(agreement.confirmed).length >= 2) {
      const at = Object.values(agreement.confirmed).sort().at(-1)!
      items.push({ at, kind: "계약서 확정", text: proposalName(proposal) })
    }
  }
  for (const payment of paymentsOf(database)) {
    if (payment.accountId !== account.id) continue
    items.push({ at: payment.paidAt ?? payment.requestedAt, kind: payment.status === "paid" ? "결제" : payment.status === "pending" ? "결제 요청" : "결제 취소", text: payment.orderName })
  }
  for (const inquiry of database.inquiries) if (inquiry.accountId === account.id) items.push({ at: inquiry.createdAt, kind: "문의", text: inquiry.category })
  for (const report of database.reports) if (report.accountId === account.id) items.push({ at: report.createdAt, kind: "신고 받음", text: report.reason })
  if (account.suspendedAt) items.push({ at: account.suspendedAt, kind: "정지", text: "" })
  return items.sort((a, b) => b.at.localeCompare(a.at))
}

// 이 계정과 연락처 전화나 사업자 번호를 같이 쓰는 다른 계정.
export function duplicatesOf(database: Database, account: Account) {
  const phone = account.contact?.phone
  const number = account.business?.number
  return database.accounts
    .filter((other) => other.id !== account.id && ((phone && other.contact?.phone === phone) || (number && other.business?.number === number)))
    .map((other) => ({ id: other.id, name: other.name, by: number && other.business?.number === number ? ("business" as const) : ("phone" as const) }))
}

// 목록용으로 전화나 사업자 번호를 같이 쓰는 다른 계정이 있는지.
export function duplicateIds(database: Database) {
  const seen = new Map<string, string[]>()
  for (const account of database.accounts) {
    for (const key of [account.contact?.phone && `p:${account.contact.phone}`, account.business?.number && `b:${account.business.number}`]) {
      if (!key) continue
      seen.set(key, [...(seen.get(key) ?? []), account.id])
    }
  }
  return new Set([...seen.values()].filter((ids) => ids.length > 1).flat())
}
