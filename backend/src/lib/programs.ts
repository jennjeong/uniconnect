import { randomUUID } from "node:crypto"

import type {
  Account,
  Database,
  Payment,
  Program,
  ProgramBrief,
  ProgramCandidate,
  ProgramCost,
  ProgramQuote,
  ProgramSchoolState,
  ProgramStatus,
  SponsorOffer,
} from "../types.js"
import { contractState } from "./agreements.js"
import { paymentsOf, sell, withVat } from "./billing.js"
import { listedTo, shownTo } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import { HttpError } from "./errors.js"
import { ownerOf } from "./owners.js"
import { statusOf } from "./proposals.js"
import { text } from "./validation.js"

// 캠퍼스 캠페인(#400): 브랜드가 여러 대학 행사에서 한 번에 집행하고 결과를 받는 상품이다.
// 브랜드가 요청서를 내면 운영자가 견적을 쓰고, 브랜드는 운영비만 플랫폼에 낸다. 실비(단체
// 지원·물류·제작)는 견적에 금액만 보이고 브랜드가 직접 지급한다(lib/payouts.ts로 기록).
// 학교마다의 제안·계약·측정은 기존 기능을 그대로 쓴다(#402).

export const programLimits = {
  // 아직 결제하지 않은 캠페인(접수, 견적)을 한 계정이 이만큼까지 둔다.
  open: 5,
  regions: 5,
  schools: 50,
  perSchool: 100_000,
  // 요청서의 기간은 이번 달부터 이만큼의 달 안이다.
  months: 12,
  costs: 10,
  // 운영비(부가세 전)의 범위다.
  minFee: 10_000,
  // 운영자가 한 캠페인에 담는 후보 단체의 수다.
  candidates: 100,
  maxFee: 100_000_000,
  maxAmount: 1_000_000_000,
}

// 운영자가 바꿀 수 있는 다음 단계다. 견적에서 섭외 중으로는 결제가 옮긴다.
const nextSteps: Partial<Record<ProgramStatus, ProgramStatus[]>> = {
  "섭외 중": ["집행 중"],
  "집행 중": ["섭외 중", "완료"],
}

export const programsOf = (database: Database) => (database.programs ??= [])

export const ownPrograms = (database: Database, accountId: string) =>
  programsOf(database).filter((program) => program.accountId === accountId)

export function findOwnProgram(database: Database, accountId: string, id: unknown) {
  const program = programsOf(database).find((item) => item.id === id && item.accountId === accountId)
  if (!program) throw new HttpError(404, "캠페인을 찾을 수 없어요.")
  return program
}

const month = /^\d{4}-(0[1-9]|1[0-2])$/

const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5))

function count(value: unknown, min: number, max: number, message: string) {
  const number = typeof value === "number" ? value : Number.NaN
  if (!Number.isInteger(number) || number < min || number > max) throw new HttpError(400, message)
  return number
}

function limited(value: unknown, max: number, message: string) {
  const result = text(value)
  if (result.length > max) throw new HttpError(400, message)
  return result
}

// 요청서를 확인한다. 기간은 이번 달부터 12달 안이다.
export function parseBrief(body: unknown, today = todayInKorea()): ProgramBrief {
  const input = (body ?? {}) as Record<string, unknown>
  const name = limited(input.name, 40, "캠페인 이름은 40자까지 쓸 수 있어요.")
  if (!name) throw new HttpError(400, "캠페인 이름을 적어 주세요.")
  const product = limited(input.product, 100, "제품 설명은 100자까지 쓸 수 있어요.")
  if (!product) throw new HttpError(400, "알리려는 제품을 적어 주세요.")
  const regions = Array.isArray(input.regions) ? input.regions.map((region) => text(region)).filter(Boolean) : []
  if (regions.length > programLimits.regions || regions.some((region) => region.length > 20)) {
    throw new HttpError(400, "지역은 다섯 곳까지 고를 수 있어요.")
  }
  const from = text(input.from)
  const to = text(input.to)
  if (!month.test(from) || !month.test(to)) throw new HttpError(400, "기간을 골라 주세요.")
  const thisMonth = today.slice(0, 7)
  if (from < thisMonth || to < from || monthsBetween(thisMonth, to) >= programLimits.months) {
    throw new HttpError(400, "기간은 이번 달부터 12달 안에서 골라 주세요.")
  }
  const schools = count(input.schools, 1, programLimits.schools, "학교 수는 1곳부터 50곳까지예요.")
  const perSchool = count(input.perSchool ?? 0, 0, programLimits.perSchool, "학교당 수량을 확인해 주세요.")
  const audience = limited(input.audience, 100, "대상 설명은 100자까지 쓸 수 있어요.")
  const asks = limited(input.asks, 500, "요청 사항은 500자까지 쓸 수 있어요.")
  const budget = input.budget === undefined || input.budget === null || input.budget === ""
    ? undefined
    : count(input.budget, 0, programLimits.maxAmount, "예산을 확인해 주세요.")
  return {
    name,
    product,
    regions: [...new Set(regions)],
    from,
    to,
    schools,
    perSchool,
    ...(audience ? { audience } : {}),
    ...(asks ? { asks } : {}),
    ...(budget !== undefined ? { budget } : {}),
  }
}

// 운영자의 견적을 확인한다.
export function parseQuote(body: unknown, now = new Date()): ProgramQuote {
  const input = (body ?? {}) as Record<string, unknown>
  const fee = count(input.fee, programLimits.minFee, programLimits.maxFee, "운영비는 1만 원부터 1억 원까지예요.")
  if (input.costs !== undefined && !Array.isArray(input.costs)) throw new HttpError(400, "실비 항목을 확인해 주세요.")
  const raw = (input.costs ?? []) as unknown[]
  if (raw.length > programLimits.costs) throw new HttpError(400, "실비 항목은 열 줄까지예요.")
  const costs: ProgramCost[] = raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>
    const label = limited(row.label, 40, "실비 항목 이름은 40자까지예요.")
    if (!label) throw new HttpError(400, "실비 항목 이름을 적어 주세요.")
    return { label, amount: count(row.amount, 0, programLimits.maxAmount, "실비 금액을 확인해 주세요.") }
  })
  const note = limited(input.note, 500, "견적 메모는 500자까지예요.")
  return { fee, costs, ...(note ? { note } : {}), quotedAt: now.toISOString() }
}

export function addProgram(database: Database, account: Account, brief: ProgramBrief, now = new Date()) {
  const open = ownPrograms(database, account.id).filter((program) => program.status === "접수" || program.status === "견적")
  if (open.length >= programLimits.open) throw new HttpError(409, "결제 전인 캠페인은 다섯 개까지 둘 수 있어요.")
  const stamp = now.toISOString()
  const program: Program = { id: randomUUID(), accountId: account.id, brief, status: "접수", createdAt: stamp, updatedAt: stamp }
  programsOf(database).push(program)
  return program
}

// 아직 결제하지 않은 캠페인의 대기 중인 주문이다.
const waitingOrder = (database: Database, program: Program) =>
  paymentsOf(database).find((payment) => payment.kind === "program" && payment.targetId === program.id && payment.status === "pending")

// 브랜드가 결제 전에 거둔다. 결제를 마친 캠페인은 운영자가 환불하며 취소한다.
export function withdrawProgram(database: Database, program: Program, now = new Date()) {
  if (program.status !== "접수" && program.status !== "견적") throw new HttpError(409, "결제한 캠페인은 문의로 취소를 요청해 주세요.")
  if (waitingOrder(database, program)?.paymentKey) throw new HttpError(409, "결제를 확인하고 있어요. 잠시 뒤에 다시 시도해 주세요.")
  program.status = "취소"
  program.updatedAt = now.toISOString()
}

// 운영자가 견적을 쓴다. 결제하기 전에는 다시 쓸 수 있다.
export function quoteProgram(database: Database, program: Program, quote: ProgramQuote) {
  if (program.status !== "접수" && program.status !== "견적") throw new HttpError(409, "결제 전인 캠페인만 견적을 바꿀 수 있어요.")
  if (waitingOrder(database, program)?.paymentKey) throw new HttpError(409, "결제를 확인하는 중이라 견적을 바꿀 수 없어요.")
  program.quote = quote
  program.status = "견적"
  program.updatedAt = quote.quotedAt
}

// 운영자가 단계를 옮긴다. 취소는 결제 전이거나, 결제가 환불된 뒤다.
export function moveProgram(database: Database, program: Program, status: ProgramStatus, reason: string, now = new Date()) {
  if (status === "취소") {
    if (program.status === "취소" || program.status === "완료") throw new HttpError(409, "이미 끝난 캠페인이에요.")
    if (program.paymentId && paymentsOf(database).some((payment) => payment.id === program.paymentId && payment.status === "paid")) {
      throw new HttpError(409, "결제를 먼저 환불해야 취소할 수 있어요.")
    }
    if (waitingOrder(database, program)?.paymentKey) throw new HttpError(409, "결제를 확인하는 중이라 취소할 수 없어요.")
    program.cancelReason = reason.slice(0, 200) || undefined
  } else if (!nextSteps[program.status]?.includes(status)) {
    throw new HttpError(409, "그 단계로 옮길 수 없어요.")
  }
  program.status = status
  program.updatedAt = now.toISOString()
}

// 후보를 담고 제안을 보내는 단계다. 운영비를 낸 뒤부터 끝나기 전까지다.
const sourcing = (program: Program) => program.status === "섭외 중" || program.status === "집행 중"

// 그 브랜드에게 보이는, 받은편지함이 있는 단체다. 운영자도 브랜드가 찾을 수 있는 단체만 담는다.
function reachableGroup(database: Database, brand: Account, groupId: string) {
  const listing = database.groups.find((item) => item.id === groupId)
  const owner = ownerOf(database, "groups", groupId)
  return listing && owner && listedTo(database, "groups", listing, brand) ? { listing, owner } : undefined
}

// 단체의 끝나지 않은 행사다.
const upcomingEventsOf = (database: Database, accountId: string, today = todayInKorea()) =>
  (database.events[accountId] ?? []).filter((event) => (event.endDate ?? event.date) >= today).sort((a, b) => a.date.localeCompare(b.date))

// 콘솔에서 후보를 고를 때 보는, 그 브랜드가 찾을 수 있는 단체와 다가오는 행사다.
export function candidateOptions(database: Database, program: Program, query: string) {
  const brand = database.accounts.find((account) => account.id === program.accountId)
  if (!brand) return []
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return database.groups
    .flatMap((listing) => {
      const found = reachableGroup(database, brand, listing.id)
      if (!found) return []
      const haystack = `${listing.name} ${listing.school ?? ""}`.toLowerCase()
      if (!words.every((word) => haystack.includes(word))) return []
      const events = upcomingEventsOf(database, found.owner.id).map((event) => ({ id: event.id, name: event.name, date: event.date, people: event.people }))
      return [{ id: listing.id, name: listing.name, school: listing.school ?? "", events }]
    })
    .slice(0, 30)
}

// 운영자가 고른 후보 목록을 확인한다. 이미 담긴 후보는 담은 때를 지킨다.
export function parseCandidates(database: Database, program: Program, body: unknown, now = new Date()): ProgramCandidate[] {
  if (!sourcing(program)) throw new HttpError(409, "운영비를 결제한 캠페인에만 후보를 담을 수 있어요.")
  const brand = database.accounts.find((account) => account.id === program.accountId)
  if (!brand) throw new HttpError(404, "캠페인을 찾을 수 없어요.")
  const raw = (body as { candidates?: unknown } | null)?.candidates
  if (!Array.isArray(raw)) throw new HttpError(400, "후보 목록을 확인해 주세요.")
  if (raw.length > programLimits.candidates) throw new HttpError(400, "후보는 100곳까지 담을 수 있어요.")
  const before = new Map((program.candidates ?? []).map((item) => [item.groupId, item]))
  const seen = new Set<string>()
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>
    const groupId = text(row.groupId)
    if (seen.has(groupId)) throw new HttpError(400, "같은 단체가 두 번 담겼어요.")
    seen.add(groupId)
    const found = reachableGroup(database, brand, groupId)
    if (!found) throw new HttpError(404, "브랜드가 찾을 수 없는 단체예요.")
    const eventId = text(row.eventId)
    if (eventId && !upcomingEventsOf(database, found.owner.id).some((event) => event.id === eventId)) {
      throw new HttpError(409, "끝났거나 찾을 수 없는 행사예요.")
    }
    const note = limited(row.note, 100, "후보 메모는 100자까지예요.")
    return {
      groupId,
      ...(eventId ? { eventId } : {}),
      ...(note ? { note } : {}),
      addedAt: before.get(groupId)?.addedAt ?? now.toISOString(),
    }
  })
}

// 브랜드가 캠페인 후보에게 제안을 보낼 수 있는지 확인하고 그 캠페인을 준다.
export function programForOffer(database: Database, account: Account, programId: string, groupId: string) {
  if (account.role !== "브랜드") throw new HttpError(400, "캠퍼스 캠페인 제안은 브랜드만 보낼 수 있어요.")
  const program = findOwnProgram(database, account.id, programId)
  if (!sourcing(program)) throw new HttpError(409, "섭외 중인 캠페인에서만 제안을 보낼 수 있어요.")
  if (!(program.candidates ?? []).some((item) => item.groupId === groupId)) throw new HttpError(409, "이 캠페인의 후보가 아닌 단체예요.")
  return program
}

// 캠페인으로 보낸 제안이다. 최신이 마지막이다.
const programOffers = (database: Database, program: Program) =>
  database.offers.filter((offer) => offer.programId === program.id && offer.fromAccountId === program.accountId)

// 제안과 계약서에서 학교 하나의 상태를 계산한다.
function schoolState(database: Database, program: Program, offer: SponsorOffer | undefined, today: string): ProgramSchoolState {
  if (!offer) return "후보"
  const status = statusOf(database, offer, today)
  if (status === "검토 중") return "대기"
  if (status === "거절") return "거절"
  if (status === "마감") return "마감"
  if (status === "취소됨") return "취소"
  const group = Boolean(ownerOf(database, "groups", offer.groupId))
  if (contractState(database, offer.id, { group, brand: true }) !== "confirmed") return "수락"
  const campaign = (database.events[program.accountId] ?? []).find((event) => event.id === offer.campaignId)
  const lastDay = campaign ? campaign.endDate ?? campaign.date : offer.campaignDate
  return lastDay && lastDay < today ? "행사 완료" : "계약 확인"
}

// 캠페인의 학교들이다. 후보와 캠페인으로 보낸 제안을 합친다. 브랜드에게는 지금 보이는 단체만
// 후보로 남기고(차단이나 숨김), 이미 보낸 제안은 그대로 보인다.
export function programSchools(database: Database, program: Program, today = todayInKorea()) {
  const brand = database.accounts.find((account) => account.id === program.accountId)
  const offers = programOffers(database, program)
  const ids = [...new Set([...(program.candidates ?? []).map((item) => item.groupId), ...offers.map((offer) => offer.groupId)])]
  return ids.flatMap((groupId) => {
    const listing = database.groups.find((item) => item.id === groupId)
    const offer = offers.filter((item) => item.groupId === groupId).at(-1)
    if (!listing || (!offer && !(brand && shownTo(database, "groups", listing, brand)))) return []
    const candidate = program.candidates?.find((item) => item.groupId === groupId)
    const owner = ownerOf(database, "groups", groupId)
    const event = candidate?.eventId && owner ? (database.events[owner.id] ?? []).find((item) => item.id === candidate.eventId) : undefined
    return [
      {
        groupId,
        name: listing.name,
        school: listing.school ?? "",
        ...(event ? { event: { id: event.id, name: event.name, date: event.date } } : {}),
        ...(candidate?.note ? { note: candidate.note } : {}),
        state: schoolState(database, program, offer, today),
        ...(offer ? { offerId: offer.id } : {}),
      },
    ]
  })
}

// 브랜드와 콘솔이 보는 캠페인이다. 실비 합계와 결제할 금액(부가세 포함)을 더한다.
export function programView(database: Database, program: Program) {
  const quote = program.quote
    ? { ...program.quote, costTotal: program.quote.costs.reduce((sum, cost) => sum + cost.amount, 0), feeWithVat: withVat(program.quote.fee) }
    : null
  const pending = waitingOrder(database, program)
  return {
    id: program.id,
    brief: program.brief,
    status: program.status,
    quote,
    paidAt: program.paidAt ?? null,
    // 계좌이체를 요청해 운영자 확인을 기다린다.
    transferRequested: Boolean(pending?.transferRequestedAt),
    ...(program.cancelReason ? { cancelReason: program.cancelReason } : {}),
    schools: programSchools(database, program),
    createdAt: program.createdAt,
    updatedAt: program.updatedAt,
  }
}

// 탈퇴하는 계정의 캠페인을 지운다. 결제 기록은 따로 5년 남는다.
export function forgetPrograms(database: Database, accountId: string) {
  if (database.programs) database.programs = database.programs.filter((program) => program.accountId !== accountId)
}

sell("program", {
  quote(database, account, targetId) {
    if (account.role !== "브랜드") throw new HttpError(403, "캠퍼스 캠페인은 브랜드 계정만 결제할 수 있어요.")
    const program = findOwnProgram(database, account.id, targetId)
    if (program.status !== "견적" || !program.quote) throw new HttpError(409, "견적이 나온 캠페인만 결제할 수 있어요.")
    return { amount: program.quote.fee, orderName: `캠퍼스 캠페인 운영비 · ${program.brief.name}` }
  },
  // 결제됨: 섭외를 시작한다.
  fulfil(database, payment: Payment) {
    const program = programsOf(database).find((item) => item.id === payment.targetId)
    if (!program || program.status !== "견적") return
    Object.assign(program, { status: "섭외 중", paymentId: payment.id, paidAt: payment.paidAt, updatedAt: new Date().toISOString() })
  },
  // 환불됨: 캠페인을 멈춘다.
  revoke(database, payment) {
    const program = programsOf(database).find((item) => item.id === payment.targetId && item.paymentId === payment.id)
    if (!program || program.status === "취소") return
    Object.assign(program, { status: "취소", cancelReason: "운영비 환불", updatedAt: new Date().toISOString() })
  },
})
