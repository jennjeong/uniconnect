import { randomUUID } from "node:crypto"
import type { Request } from "express"
import { Router } from "express"

import { findListing, ownerOf, shownTo } from "../lib/catalog.js"
import { todayInKorea, toIsoDate } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { eventDemand } from "../lib/demand.js"
import { eventCases, exploreEvents } from "../lib/explore.js"
import { eventPhotos, folderBytes, forgetPhotos, parsePdf, parsePhoto, photoName, photoType, photos } from "../lib/photos.js"
import { isDemoAccount } from "../lib/reviews.js"
import { isSponsored } from "../lib/sponsorships.js"
import { audienceYears, eventKinds, handoutWays, logoSpots, parseRole, promoPosts, sponsorTypes, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, EventItem, RequestStatus, Role, SponsorPackage } from "../types.js"

export const eventsRouter = Router()

// 행사 기간이 첫날 뒤로 며칠까지 이어질 수 있는지 정한다.
const maxDays = 89

// 목표 양식이 허용하는 행사의 최대 예상 인원이다.
const maxPeople = 100_000

// "1,234명" or "1234" as the people an event expects, written back as
// "1,234명"; empty when not given. Undefined when it is not 1 to maxPeople.
function parsePeople(value: string) {
  if (!value) return ""
  const count = Number(value.replace(/[,\s]/g, "").replace(/명$/, ""))
  if (!Number.isInteger(count) || count < 1 || count > maxPeople) return undefined
  return `${count.toLocaleString("ko-KR")}명`
}

// 방문자는 미리 보는 역할의 데모 계정 행사를 본다.
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
  | "promo"
>

// 행사 페이지에 담을 수 있는 최대치다. 패키지 넷과 사진 넷이다.
const maxPackages = 4
const maxEventPhotos = 4

// 단체의 협찬 패키지다. 각각 이름과 브랜드가 받는 것을 담고, 말하면
// 요청하는 지원도 담는다.
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

// 등록하거나 수정하는 행사나 캠페인의 항목이다. 두 경우 모두 같은 방식으로
// 검사한다.
function parseEventFields(role: Role, body: Request["body"]): EventFields {
  const students = role === "학생단체"
  const name = text(body?.name)
  const rawDate = text(body?.date)
  // 여러 날에 걸친 행사의 마지막 날이다.
  const rawEndDate = text(body?.endDate)
  const people = parsePeople(text(body?.people))
  const types: string[] = Array.isArray(body?.types)
    ? sponsorTypes.filter((type) => body.types.map(String).includes(type))
    : []
  // Free text describing the "기타" type.
  const typeNote = text(body?.typeNote)
  // 원 단위의 예산이며 선택이다. 단체는 행사의, 브랜드는 캠페인의 예산을
  // 쓴다.
  const rawBudget = text(body?.budget)
  const budget = rawBudget ? Number(rawBudget) : undefined
  // 단체의 행사 페이지다. 장소, 행사 소개, 패키지를 담는다.
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
  // 단체의 행사다. 종류, 시간, 오는 사람을 담고 비어 있으면 각각 뺀다.
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
  const promo = students ? parsePromo(body?.promo, body?.promoAgreed) : undefined
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
    ...(promo ? { promo } : {}),
  }
}

// 홍보 · 배포 계획이다. 각 목록에서 고른 것은 단체가 실행에 동의한 뒤에만
// 보관한다(수정해도 처음 동의한 시각을 유지한다).
function parsePromo(value: unknown, agreed: unknown): EventItem["promo"] {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "object") throw new HttpError(400, "홍보 · 배포 계획을 다시 확인해 주세요.")
  const input = value as Record<string, unknown>
  const pick = (list: readonly string[], chosen: unknown) =>
    Array.isArray(chosen) ? list.filter((item) => chosen.map(String).includes(item)) : []
  const spots = pick(logoSpots, input.spots)
  const handouts = pick(handoutWays, input.handouts)
  const posts = pick(promoPosts, input.posts)
  if (spots.length + handouts.length + posts.length === 0) return undefined
  if (agreed !== true) throw new HttpError(400, "고른 홍보 · 배포 계획을 이행하는 데 동의해 주세요.")
  const agreedAt = typeof input.agreedAt === "string" && !Number.isNaN(Date.parse(input.agreedAt)) ? input.agreedAt : new Date().toISOString()
  return { spots, handouts, posts, agreedAt }
}

// 단체의 행사에 올 것으로 기대하는 사람이다. 목록에서 고른 학년과 쓴 그대로의
// 전공 분야다. 없으면 undefined다.
function parseMakeup(value: unknown): EventItem["makeup"] {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "object") throw new HttpError(400, "참가자 구성을 다시 확인해 주세요.")
  const input = value as Record<string, unknown>
  const years = Array.isArray(input.years) ? audienceYears.filter((year) => (input.years as unknown[]).map(String).includes(year)) : []
  const majors = text(input.majors)
  if (majors.length > 60) throw new HttpError(400, "주요 전공은 60자 이하로 적어 주세요.")
  if (years.length === 0 && !majors) return undefined
  return {
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

// 행사에 대한 제안과 그 행사에 기록된 협찬은 행사의 이름과 날짜를 복사해
// 가지므로, 수정하면 새 값을 따라간다. 거절하거나 취소한 제안은 그대로
// 둔다.
const followed = (status: RequestStatus) => status === "검토 중" || status === "수락"

// 수정 내용을 그 복사본에 반영한다. 아직 대기 중이거나 수락된 제안마다
// 상대편에게 볼 페이지와 함께 알린다.
function followEvent(database: Database, account: Account, event: EventItem, datesChanged: boolean) {
  const partners = new Map<string, string>()
  const follow = (sponsorship: { eventName: string; date: string; remindedAt?: string }) => {
    sponsorship.eventName = event.name
    sponsorship.date = event.date
    // 새 날짜에 맞춰 알림을 다시 보낸다.
    if (datesChanged) delete sponsorship.remindedAt
  }
  if (account.role === "학생단체") {
    for (const request of database.requests) {
      if (request.fromAccountId !== account.id || request.eventId !== event.id || !followed(request.status)) continue
      request.eventName = event.name
      request.eventDate = event.date
      request.people = event.people ? `예상 인원 ${event.people}` : "인원 협의"
      const brand = ownerOf(database, "brands", request.brandId)
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
      const group = ownerOf(database, "groups", offer.groupId)
      if (group) partners.set(group.id, offer.status === "수락" ? `/agreements/${offer.id}` : "/offers")
    }
  }
  return [...partners].map(([id, path]) => ({ account: database.accounts.find((item) => item.id === id), path }))
}

// 주인이 행사나 캠페인을 바꾼다. 등록할 때와 같은 검사를 한다. 시작한
// 뒤에는 결과를 그 날짜로 집계했으므로 날짜는 그대로 둔다. 그에 대한 제안과
// 협찬이 따라가고, 파트너는 새 이름, 날짜, 인원을 알림으로 받는다.
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
  // 이미 지난 날로 옮기면 곧바로 끝난 것으로 읽혀(후기, 결과) 버리므로,
  // 새 날짜는 오늘 이후여야 한다.
  if (datesChanged && fields.date < todayInKorea()) {
    throw new HttpError(400, "날짜는 오늘이나 그 뒤로 옮겨 주세요.")
  }

  const before = { ...event }
  // 수정에서 빠진 항목(이제 하루, 기타 없음, 예산 없음, 장소 없음, 소개나
  // 패키지 없음)은 지우고 사진은 남긴다.
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
  // 협찬의 기록과 결과는 협찬받은 행사에 달려 있다.
  if (isSponsored(database, eventId)) {
    throw new HttpError(409, "협찬이 확정된 행사는 지울 수 없어요. 협찬사와 먼저 이야기해 주세요.")
  }
  // 아직 답을 기다리는 그 행사의 제안은 양쪽에서 철회한다. 답한 제안은
  // 이력에 남는다.
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
  // 그 행사의 게시판 글은 더 이상 지원을 받지 않는다.
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

// 행사 페이지에 보이는 단체의 행사다. 단체 자신과 그 단체를 볼 수 있는
// 사람에게(프로필처럼 shownTo) 행사, 단체의 리스팅, 보는 사람이 주인인지를
// 보여 준다.
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

// 행사 둘러보기다. 보는 사람이 볼 수 있는 단체의 다가오는 행사와, 비슷한
// 행사가 종류별로 받은 협찬을 보여 준다.
eventsRouter.get("/explore", (req, res) => {
  const database = getDatabase()
  res.json({ events: exploreEvents(database, req.account), cases: eventCases(database, req.account) })
})

// 대학별 · 시기별 행사 수요(#344, lib/demand.ts). 로그인한 회원이면 누구나 본다. 실제 회원의
// 수이므로, 예시만 만나는 공용 데모 계정에는 보이지 않는다.
eventsRouter.get("/demand", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 행사 수요를 볼 수 없어요.")
  res.json(eventDemand(database))
})

// 행사의 예산은 그 행사에 대한 제안의 두 쪽, 곧 단체와 단체가 제안을 보낸
// 브랜드를 위한 것이다.
const seesBudget = (database: Database, eventId: string, viewer: Account | undefined) =>
  Boolean(viewer?.brandId) &&
  database.requests.some((request) => request.eventId === eventId && request.brandId === viewer!.brandId)

eventsRouter.get("/:id/page", (req, res) => {
  const database = getDatabase()
  const found = eventPage(database, String(req.params.id), req.account)
  if (!found) throw new HttpError(404, "행사를 찾을 수 없어요.")
  const { remindedAt: _reminded, budget, ...event } = found.event
  if (budget !== undefined && (found.own || seesBudget(database, found.event.id, req.account))) {
    Object.assign(event, { budget })
  }
  const { id, name, school, category, industry, logo } = found.listing
  res.json({ event, group: { id, name, school, category, industry, ...(logo ? { logo } : {}) }, own: found.own })
})

// 페이지를 볼 수 있는 사람에게 행사 페이지의 사진을 보여 준다. 페이지는
// 로그인 토큰으로 가져온다.
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

// 주소로 찾는 단체 자신의 행사다.
function ownEvent(req: Request) {
  const account = requireAccount(req)
  const event = (getDatabase().events[account.id] ?? []).find((item) => item.id === req.params.id)
  if (!event || account.role !== "학생단체") throw new HttpError(404, "행사를 찾을 수 없어요.")
  return { account, event }
}

// 단체가 행사 페이지에 사진을 올린다. 최대 넷이며 lib/photos.ts로 보관한다
// (디스크에, Vercel에서는 Postgres에 둔다).
// 행사 수에는 한도가 없으므로 계정 전체의 파일 수도 막는다. 공유 데모 계정은
// 올리지 못한다.
const maxEventFiles = 100
export const eventFiles = { maxBytes: 50 * 1024 * 1024 }

async function assertCanUpload(req: Request) {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 파일을 올릴 수 없어요.")
  const files = (database.events[account.id] ?? []).reduce((sum, event) => sum + (event.photos?.length ?? 0) + (event.plan ? 1 : 0), 0)
  if (files >= maxEventFiles) throw new HttpError(409, `행사 사진과 기획안은 계정마다 ${maxEventFiles}개까지 올릴 수 있어요.`)
  const folders = (database.events[account.id] ?? []).map((event) => eventPhotos(event.id))
  if ((await folderBytes(folders)) >= eventFiles.maxBytes) {
    throw new HttpError(409, "행사 사진과 기획안의 용량이 가득 찼어요. 지난 파일을 지운 뒤 다시 올려 주세요.")
  }
}

eventsRouter.post("/:id/photos", async (req, res) => {
  const { event } = ownEvent(req)
  await assertCanUpload(req)
  if ((event.photos?.length ?? 0) >= maxEventPhotos) {
    throw new HttpError(409, `행사 사진은 ${maxEventPhotos}장까지 올릴 수 있어요.`)
  }
  const parsed = parsePhoto(req.body?.image)
  if (!parsed) throw new HttpError(400, "사진은 PNG, JPG, WebP로 올려 주세요.")
  const store = photos()
  await store.put(eventPhotos(event.id), parsed.name, parsed.bytes)
  try {
    // 다시 찾는다. 사진이 들어오는 동안 데이터를 새로 읽었을 수 있다.
    const fresh = ownEvent(req).event
    fresh.photos = [...(fresh.photos ?? []), parsed.name]
    await saveDatabase()
    res.status(201).json({ event: fresh })
  } catch (error) {
    // 데이터가 사진을 넣기 전으로 돌아갔으므로 사진 저장소도 돌린다.
    await store.remove(eventPhotos(event.id), [parsed.name])
    throw error
  }
})

// 행사 기획안이다. 단체가 행사 페이지에 기획 PDF(2MB 이하)를 한 번에
// 하나씩 올리며, 사진 옆에 보관한다. 페이지를 볼 수 있는 브랜드가 내려받는다.
eventsRouter.post("/:id/plan", async (req, res) => {
  const { event } = ownEvent(req)
  await assertCanUpload(req)
  const parsed = parsePdf(req.body?.file)
  if (!parsed) throw new HttpError(400, "기획안은 2MB 이하의 PDF로 올려 주세요.")
  const name = text(req.body?.name).replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80) || "기획안.pdf"
  const store = photos()
  await store.put(eventPhotos(event.id), parsed.name, parsed.bytes)
  let previous: string | undefined
  try {
    const fresh = ownEvent(req).event
    previous = fresh.plan?.file
    fresh.plan = { file: parsed.name, name, size: parsed.bytes.length, addedAt: new Date().toISOString() }
    await saveDatabase()
    res.status(201).json({ event: fresh })
  } catch (error) {
    await store.remove(eventPhotos(event.id), [parsed.name])
    throw error
  }
  // 대체된 기획안은 새 기획안이 저장된 뒤에 지운다.
  if (previous) await store.remove(eventPhotos(event.id), [previous])
})

eventsRouter.delete("/:id/plan", async (req, res) => {
  const { event } = ownEvent(req)
  const file = event.plan?.file
  if (!file) throw new HttpError(404, "기획안을 찾을 수 없어요.")
  delete event.plan
  await saveDatabase()
  await forgetPhotos(eventPhotos(event.id), [file])
  res.json({ event })
})

eventsRouter.get("/:id/plan", async (req, res) => {
  const found = eventPage(getDatabase(), String(req.params.id), req.account)
  const plan = found?.event.plan
  const bytes = found && plan ? await photos().get(eventPhotos(found.event.id), plan.file) : undefined
  if (!bytes || !plan) throw new HttpError(404, "기획안을 찾을 수 없어요.")
  res
    .type("application/pdf")
    .set("Cache-Control", "private, max-age=3600")
    .set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(plan.name)}`)
    .send(bytes)
})

eventsRouter.delete("/:id/photos/:photo", async (req, res) => {
  const { event } = ownEvent(req)
  const photo = String(req.params.photo)
  if (!event.photos?.includes(photo)) throw new HttpError(404, "사진을 찾을 수 없어요.")
  event.photos = event.photos.filter((item) => item !== photo)
  if (event.photos.length === 0) delete event.photos
  await saveDatabase()
  await forgetPhotos(eventPhotos(event.id), [photo])
  res.json({ event })
})
