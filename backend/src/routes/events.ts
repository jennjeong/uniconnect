import { randomUUID } from "node:crypto"
import type { Request } from "express"
import { Router } from "express"

import { todayInKorea, toIsoDate } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { isSponsored } from "../lib/sponsorships.js"
import { parseRole, sponsorTypes, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, EventItem, Role } from "../types.js"

export const eventsRouter = Router()

// How many days past the first an event's period can run.
const maxDays = 89

// The most people an event can expect, as the goals form allows.
const maxPeople = 100_000

// "1,234명" or "1234" as the people an event expects, written back as
// "1,234명"; empty when not given. Undefined when it is not 1 to maxPeople.
function parsePeople(value: string) {
  if (!value) return ""
  const count = Number(value.replace(/[,\s]/g, "").replace(/명$/, ""))
  if (!Number.isInteger(count) || count < 1 || count > maxPeople) return undefined
  return `${count.toLocaleString("ko-KR")}명`
}

// Visitors see the demo account's events for the role they are previewing.
eventsRouter.get("/", (req, res) => {
  const database = getDatabase()
  const ownerId = req.account?.id ?? database.demoAccountIds[parseRole(req.query.role)]
  res.json({ events: database.events[ownerId] ?? [] })
})

type EventFields = Pick<EventItem, "name" | "date" | "endDate" | "people" | "types" | "typeNote" | "budget">

// An event's or campaign's fields as they are registered or edited, checked
// the same way both times.
function parseEventFields(role: Role, body: Request["body"]): EventFields {
  const students = role === "학생단체"
  const name = text(body?.name)
  const rawDate = text(body?.date)
  // The last day, for an event over several days.
  const rawEndDate = text(body?.endDate)
  const people = parsePeople(text(body?.people))
  const types: string[] = Array.isArray(body?.types)
    ? sponsorTypes.filter((type) => body.types.map(String).includes(type))
    : []
  // Free text describing the "기타" type.
  const typeNote = text(body?.typeNote)
  // Brands plan an optional campaign budget in won.
  const rawBudget = students ? "" : text(body?.budget)
  const budget = rawBudget ? Number(rawBudget) : undefined

  if (!name || !rawDate) {
    throw new HttpError(400, `${students ? "행사명" : "캠페인명"}과 일정을 입력해 주세요.`)
  }
  if (name.length > 40) {
    throw new HttpError(400, `${students ? "행사명" : "캠페인명"}은 40자 이하로 적어 주세요.`)
  }
  if (people === undefined) {
    const label = students ? "예상 참여 인원" : "목표 도달 인원"
    throw new HttpError(400, `${label}은 1명부터 ${maxPeople.toLocaleString("ko-KR")}명까지 숫자로 적어 주세요.`)
  }
  const date = toIsoDate(rawDate)
  if (!date) throw new HttpError(400, "일정은 달력에서 날짜를 골라 주세요.")
  const endDate = rawEndDate ? toIsoDate(rawEndDate) : undefined
  if (rawEndDate && (!endDate || endDate < date)) {
    throw new HttpError(400, "끝나는 날은 시작일과 같거나 그 뒤로 골라 주세요.")
  }
  if (endDate && Date.parse(endDate) - Date.parse(date) > maxDays * 86_400_000) {
    throw new HttpError(400, `기간은 최대 ${maxDays + 1}일까지 고를 수 있어요.`)
  }
  if (types.length === 0) {
    throw new HttpError(
      400,
      students ? "원하는 협찬 유형을 하나 이상 골라 주세요." : "제공할 협찬 형태를 하나 이상 골라 주세요.",
    )
  }
  if (types.includes("기타") && !typeNote) {
    throw new HttpError(400, "기타 협찬 유형을 적어 주세요.")
  }
  if (typeNote.length > 30) throw new HttpError(400, "기타 협찬 유형은 30자 이하로 적어 주세요.")
  if (budget !== undefined && !(Number.isInteger(budget) && budget >= 0 && budget <= 1e10)) {
    throw new HttpError(400, "예산은 0원 이상 숫자로 입력해 주세요.")
  }

  return {
    name,
    date,
    ...(endDate && endDate !== date ? { endDate } : {}),
    people,
    types,
    ...(types.includes("기타") ? { typeNote } : {}),
    ...(budget === undefined ? {} : { budget }),
  }
}

eventsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const event: EventItem = {
    id: randomUUID(),
    ...parseEventFields(account.role, req.body),
    status: "매칭 중",
    createdAt: new Date().toISOString(),
  }
  const database = getDatabase()
  database.events[account.id] = [event, ...(database.events[account.id] ?? [])]
  await saveDatabase()
  res.status(201).json({ event })
})

// "11월 3일", or "11월 3일 ~ 11월 5일" for a period, in the emails.
const dayLabel = (iso: string) => {
  const [, month, day] = iso.split("-")
  return `${Number(month)}월 ${Number(day)}일`
}
const periodLabel = (date: string, endDate?: string) =>
  endDate ? `${dayLabel(date)} ~ ${dayLabel(endDate)}` : dayLabel(date)

// Proposals about an event and the sponsorships recorded for it carry its
// name and dates, so after an edit they take the new ones; declined
// proposals stay as they were sent. Answers the other side of each
// proposal still waiting or accepted, with the page to look at.
function followEvent(database: Database, account: Account, event: EventItem, datesChanged: boolean) {
  const partners = new Map<string, string>()
  const follow = (sponsorship: { eventName: string; date: string; remindedAt?: string }) => {
    sponsorship.eventName = event.name
    sponsorship.date = event.date
    // The reminder goes again for the new day.
    if (datesChanged) delete sponsorship.remindedAt
  }
  if (account.role === "학생단체") {
    for (const request of database.requests) {
      if (request.fromAccountId !== account.id || request.eventId !== event.id || request.status === "거절") continue
      request.eventName = event.name
      request.eventDate = event.date
      request.people = event.people ? `예상 인원 ${event.people}` : "인원 협의"
      const brand = database.accounts.find((item) => item.brandId === request.brandId)
      if (brand) partners.set(brand.id, request.status === "수락" ? `/agreements/${request.id}` : "/inbox")
    }
    for (const list of Object.values(database.sponsorships)) {
      for (const sponsorship of list) if (sponsorship.eventId === event.id) follow(sponsorship)
    }
  } else {
    for (const offer of database.offers) {
      if (offer.fromAccountId !== account.id || offer.campaignId !== event.id || offer.status === "거절") continue
      offer.campaignName = event.name
      offer.campaignDate = event.date
      const sponsorship = (database.sponsorships[account.id] ?? []).find((item) => item.id === `sp-${offer.id}`)
      if (sponsorship) follow(sponsorship)
      const group = database.accounts.find((item) => item.groupId === offer.groupId)
      if (group) partners.set(group.id, offer.status === "수락" ? `/agreements/${offer.id}` : "/offers")
    }
  }
  return [...partners].map(([id, path]) => ({ account: database.accounts.find((item) => item.id === id), path }))
}

// The owner changes an event or campaign, with the same checks as when it
// was registered. Its dates stay once it has begun, as its results were
// counted on them. Proposals about it and its sponsorships follow, and the
// partners hear of a new name, day or head count.
eventsRouter.put("/:id", async (req, res) => {
  const account = requireAccount(req)
  const students = account.role === "학생단체"
  const database = getDatabase()
  const event = (database.events[account.id] ?? []).find((item) => item.id === req.params.id)
  if (!event) throw new HttpError(404, "행사를 찾을 수 없어요.")
  const fields = parseEventFields(account.role, req.body)
  const datesChanged = fields.date !== event.date || fields.endDate !== event.endDate
  if (datesChanged && event.date <= todayInKorea()) {
    throw new HttpError(409, `이미 시작한 ${students ? "행사는" : "캠페인은"} 날짜를 바꿀 수 없어요.`)
  }

  const before = { ...event }
  // Fields the edit leaves out (one day now, no 기타, no budget) go.
  delete event.endDate
  delete event.typeNote
  delete event.budget
  Object.assign(event, fields)
  if (datesChanged) delete event.remindedAt
  const partners = followEvent(database, account, event, datesChanged)
  await saveDatabase()

  const what = students ? "행사" : "캠페인"
  const lines = [
    before.name !== event.name ? `이름: ${before.name} → ${event.name}` : "",
    datesChanged ? `일정: ${periodLabel(before.date, before.endDate)} → ${periodLabel(event.date, event.endDate)}` : "",
    before.people !== event.people
      ? `${students ? "예상 참여 인원" : "목표 도달 인원"}: ${before.people || "미정"} → ${event.people || "미정"}`
      : "",
  ].filter(Boolean)
  if (lines.length > 0) {
    for (const partner of partners) {
      void notify(
        partner.account,
        `${what} 정보가 바뀌었어요`,
        [`${account.name}에서 '${before.name}' ${what} 정보를 바꿨어요.`, ...lines],
        partner.path,
      )
    }
  }
  res.json({ event })
})

eventsRouter.delete("/:id", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const events = database.events[account.id] ?? []
  const eventId = req.params.id
  if (!events.some((event) => event.id === eventId)) {
    throw new HttpError(404, "행사를 찾을 수 없어요.")
  }
  // A sponsor's records and results depend on a sponsored event.
  if (isSponsored(database, eventId)) {
    throw new HttpError(409, "협찬이 확정된 행사는 지울 수 없어요. 협찬사와 먼저 이야기해 주세요.")
  }
  // Proposals about it still waiting for an answer are withdrawn, on both
  // sides; answered ones stay in the history.
  const withdrawn = new Set([
    ...database.requests.filter((item) => item.eventId === eventId && item.status === "검토 중").map((item) => item.brandId),
    ...database.offers.filter((item) => item.campaignId === eventId && item.status === "검토 중").map((item) => item.groupId),
  ])
  database.requests = database.requests.filter((item) => !(item.eventId === eventId && item.status === "검토 중"))
  database.offers = database.offers.filter((item) => !(item.campaignId === eventId && item.status === "검토 중"))
  const stillOpen = (partnerId: string) =>
    database.requests.some((item) => item.fromAccountId === account.id && item.brandId === partnerId && item.status !== "거절") ||
    database.offers.some((item) => item.fromAccountId === account.id && item.groupId === partnerId && item.status !== "거절")
  database.proposals[account.id] = (database.proposals[account.id] ?? []).filter(
    (partnerId) => !withdrawn.has(partnerId) || stillOpen(partnerId),
  )
  database.events[account.id] = events.filter((event) => event.id !== eventId)
  database.measurements = database.measurements.filter(
    (measurement) => !(measurement.eventId === eventId && measurement.accountId === account.id),
  )
  await saveDatabase()
  res.status(204).end()
})
