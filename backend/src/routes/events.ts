import { randomUUID } from "node:crypto"
import type { Request } from "express"
import { Router } from "express"

import { findListing, shownTo } from "../lib/catalog.js"
import { todayInKorea, toIsoDate } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { eventPhotos, parsePhoto, photoName, photoType, photos } from "../lib/photos.js"
import { isSponsored } from "../lib/sponsorships.js"
import { audienceYears, eventKinds, parseRole, sponsorTypes, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, EventItem, RequestStatus, Role, SponsorPackage } from "../types.js"

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

type EventFields = Pick<
  EventItem,
  | "name"
  | "date"
  | "endDate"
  | "people"
  | "types"
  | "typeNote"
  | "budget"
  | "venue"
  | "intro"
  | "packages"
  | "kind"
  | "startTime"
  | "endTime"
  | "makeup"
>

// What an event page holds, at most: four packages and four photos.
const maxPackages = 4
const maxEventPhotos = 4

// A group's sponsorship packages: each with a name and what the brand gets,
// and the support it asks for when it says.
function parsePackages(value: unknown): SponsorPackage[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxPackages) {
    throw new HttpError(400, `협찬 혜택 묶음은 ${maxPackages}개까지 넣을 수 있어요.`)
  }
  return value.map((item) => {
    const name = text(item?.name)
    const gives = text(item?.gives)
    const asks = text(item?.asks)
    if (!name || !gives) throw new HttpError(400, "혜택 묶음마다 이름과 브랜드가 받는 것을 적어 주세요.")
    if (name.length > 30 || gives.length > 200 || asks.length > 100) {
      throw new HttpError(400, "혜택 묶음은 이름 30자, 받는 것 200자, 원하는 협찬 100자까지 적을 수 있어요.")
    }
    return { name, gives, asks }
  })
}

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
  // A group's event page: where it is, what it is, and its packages.
  const venue = students ? text(body?.venue) : ""
  const intro = students ? text(body?.intro) : ""
  const packages = students ? parsePackages(body?.packages) : []

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
  // A group's event: its kind, times and who comes, each left out when empty.
  const kind = students ? text(body?.kind) : ""
  if (kind && !(eventKinds as readonly string[]).includes(kind)) throw new HttpError(400, "행사 유형을 목록에서 골라 주세요.")
  const clock = /^([01]\d|2[0-3]):[0-5]\d$/
  const startTime = students ? text(body?.startTime) : ""
  const endTime = students ? text(body?.endTime) : ""
  if ((startTime && !clock.test(startTime)) || (endTime && !clock.test(endTime))) {
    throw new HttpError(400, "시각은 00:00부터 23:59까지 골라 주세요.")
  }
  if (endTime && !startTime) throw new HttpError(400, "끝나는 시각은 시작 시각과 함께 골라 주세요.")
  if (startTime && endTime && endTime <= startTime) throw new HttpError(400, "끝나는 시각은 시작 시각 뒤로 골라 주세요.")
  const makeup = students ? parseMakeup(body?.makeup) : undefined
  if (venue.length > 60) throw new HttpError(400, "장소는 60자 이하로 적어 주세요.")
  if (intro.length > 1000) throw new HttpError(400, "행사 소개는 1000자 이하로 적어 주세요.")

  return {
    name,
    date,
    ...(endDate && endDate !== date ? { endDate } : {}),
    people,
    types,
    ...(types.includes("기타") ? { typeNote } : {}),
    ...(budget === undefined ? {} : { budget }),
    ...(venue ? { venue } : {}),
    ...(intro ? { intro } : {}),
    ...(packages.length > 0 ? { packages } : {}),
    ...(kind ? { kind } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    ...(makeup ? { makeup } : {}),
  }
}

// Who is expected at a group's event: the share of women (0–100), the
// years from the list and fields of study as written. Undefined when none.
function parseMakeup(value: unknown): EventItem["makeup"] {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "object") throw new HttpError(400, "참가자 구성을 다시 확인해 주세요.")
  const input = value as Record<string, unknown>
  const rawFemale = input.female
  const female = rawFemale === undefined || rawFemale === null || rawFemale === "" ? undefined : Number(rawFemale)
  if (female !== undefined && !(Number.isInteger(female) && female >= 0 && female <= 100)) {
    throw new HttpError(400, "여성 비율은 0부터 100까지 숫자로 적어 주세요.")
  }
  const years = Array.isArray(input.years) ? audienceYears.filter((year) => (input.years as unknown[]).map(String).includes(year)) : []
  const majors = text(input.majors)
  if (majors.length > 60) throw new HttpError(400, "주요 전공은 60자 이하로 적어 주세요.")
  if (female === undefined && years.length === 0 && !majors) return undefined
  return {
    ...(female === undefined ? {} : { female }),
    ...(years.length ? { years } : {}),
    ...(majors ? { majors } : {}),
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
// name and dates, so after an edit they take the new ones; declined and
// called-off proposals stay as they were.
const followed = (status: RequestStatus) => status === "검토 중" || status === "수락"

// Carries an edit into those copies. Answers the other side of each
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
      if (request.fromAccountId !== account.id || request.eventId !== event.id || !followed(request.status)) continue
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
      if (offer.fromAccountId !== account.id || offer.campaignId !== event.id || !followed(offer.status)) continue
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
  // Fields the edit leaves out (one day now, no 기타, no budget, no venue,
  // introduction or packages) go; the photos stay.
  delete event.endDate
  delete event.typeNote
  delete event.budget
  delete event.venue
  delete event.intro
  delete event.packages
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
        "sponsorships",
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
  // Its board posts take no more applications.
  for (const post of database.posts) {
    if (post.accountId === account.id && post.eventId === eventId) post.closedAt ??= new Date().toISOString()
  }
  database.measurements = database.measurements.filter(
    (measurement) => !(measurement.eventId === eventId && measurement.accountId === account.id),
  )
  await saveDatabase()
  await photos().removeAll([eventPhotos(eventId)])
  res.status(204).end()
})

// A student group's event as its page shows it, for the group itself and for
// anyone who sees the group (shownTo, as its profile): the event, the group's
// listing, and whether the one looking owns it.
function eventPage(database: Database, eventId: string, viewer?: Account) {
  for (const [ownerId, events] of Object.entries(database.events)) {
    const event = events.find((item) => item.id === eventId)
    if (!event) continue
    const owner = database.accounts.find((item) => item.id === ownerId)
    const listing = owner?.role === "학생단체" ? findListing(database, owner) : undefined
    const own = viewer !== undefined && viewer.id === ownerId
    if (!owner || !listing || (!own && !shownTo(database, "groups", listing, viewer))) return undefined
    return { event, listing, own }
  }
  return undefined
}

eventsRouter.get("/:id/page", (req, res) => {
  const found = eventPage(getDatabase(), String(req.params.id), req.account)
  if (!found) throw new HttpError(404, "행사를 찾을 수 없어요.")
  const { remindedAt: _reminded, ...event } = found.event
  const { id, name, school, category, industry, logo } = found.listing
  res.json({ event, group: { id, name, school, category, industry, ...(logo ? { logo } : {}) }, own: found.own })
})

// A photo of an event page, for those who may see the page; the page
// fetches it with the login token.
eventsRouter.get("/:id/photos/:photo", async (req, res) => {
  const found = eventPage(getDatabase(), String(req.params.id), req.account)
  const photo = String(req.params.photo)
  if (!found || !photoName.test(photo) || !found.event.photos?.includes(photo)) {
    throw new HttpError(404, "사진을 찾을 수 없어요.")
  }
  const bytes = await photos().get(eventPhotos(found.event.id), photo)
  if (!bytes) throw new HttpError(404, "사진을 찾을 수 없어요.")
  res.type(photoType(photo)).set("Cache-Control", "private, max-age=3600").send(bytes)
})

// The group's own event, by the address.
function ownEvent(req: Request) {
  const account = requireAccount(req)
  const event = (getDatabase().events[account.id] ?? []).find((item) => item.id === req.params.id)
  if (!event || account.role !== "학생단체") throw new HttpError(404, "행사를 찾을 수 없어요.")
  return { account, event }
}

// The group adds a photo to its event page, four at most, kept with
// lib/photos.ts (on disk, or in Postgres on Vercel).
eventsRouter.post("/:id/photos", async (req, res) => {
  const { event } = ownEvent(req)
  if ((event.photos?.length ?? 0) >= maxEventPhotos) {
    throw new HttpError(409, `행사 사진은 ${maxEventPhotos}장까지 올릴 수 있어요.`)
  }
  const parsed = parsePhoto(req.body?.image)
  if (!parsed) throw new HttpError(400, "사진은 PNG, JPG, WebP로 올려 주세요.")
  const store = photos()
  await store.put(eventPhotos(event.id), parsed.name, parsed.bytes)
  try {
    // Looked up again: the data may have been read anew while the photo went in.
    const fresh = ownEvent(req).event
    fresh.photos = [...(fresh.photos ?? []), parsed.name]
    await saveDatabase()
    res.status(201).json({ event: fresh })
  } catch (error) {
    // The data went back to before the photo; so does the photo store.
    await store.remove(eventPhotos(event.id), [parsed.name])
    throw error
  }
})

eventsRouter.delete("/:id/photos/:photo", async (req, res) => {
  const { event } = ownEvent(req)
  const photo = String(req.params.photo)
  if (!event.photos?.includes(photo)) throw new HttpError(404, "사진을 찾을 수 없어요.")
  event.photos = event.photos.filter((item) => item !== photo)
  if (event.photos.length === 0) delete event.photos
  await saveDatabase()
  await photos().remove(eventPhotos(event.id), [photo])
  res.json({ event })
})
