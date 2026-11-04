import { randomBytes } from "node:crypto"
import { Router, type Request } from "express"

import { config } from "../config.js"
import { findListing } from "../lib/catalog.js"
import { addDays, todayInKorea } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { calendarFile, type CalendarEntry } from "../lib/ics.js"
import { isDemoAccount } from "../lib/reviews.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

export const calendarRouter = Router()

// 구독한 캘린더가 지난 날짜를 얼마나 거슬러 올라가 담는지 정한다.
const keepDays = 90

// 캘린더 앱이 구독하는 주소다. SITE_URL이 있으면 사이트 자체 주소를 쓰고,
// 없으면 이 요청이 들어온 주소를 쓴다.
const feedUrl = (req: Request, token: string) =>
  `${config.siteUrl?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`}/api/calendar/${token}.ics`

// 계정의 구독 캘린더에 담기는 내용이다. 90일 전부터의 행사나 캠페인, 확정된
// 협찬의 날짜(브랜드가 단체의 행사를 협찬하는 경우, 단체가 브랜드의 캠페인에
// 참여하는 경우)를 담으며, 캘린더에 추가 시트가 보여 주는 목록과 같다.
export function feedEntries(database: Database, account: Account): CalendarEntry[] {
  const from = addDays(todayInKorea(), -keepDays)
  const own: CalendarEntry[] = (database.events[account.id] ?? []).map((event) => ({
    id: event.id,
    title: event.name,
    date: event.date,
    endDate: event.endDate,
    description: [event.people, event.types.join(", ")].filter(Boolean).join(" · "),
  }))
  const sponsored: CalendarEntry[] = account.brandId
    ? database.requests
        .filter((request) => request.brandId === account.brandId && request.status === "수락" && request.eventDate)
        .map((request) => ({
          id: request.id,
          title: `협찬 · ${request.groupName} ${request.eventName}`,
          date: request.eventDate,
          description: request.ask,
        }))
    : account.groupId
      ? database.offers
          .filter((offer) => offer.groupId === account.groupId && offer.status === "수락" && offer.campaignDate)
          .map((offer) => ({
            id: offer.id,
            title: `협찬 · ${offer.brandName} ${offer.campaignName}`,
            date: offer.campaignDate,
            description: offer.offer,
          }))
      : []
  return [...own, ...sponsored]
    .filter((entry) => (entry.endDate ?? entry.date) >= from)
    .sort((a, b) => a.date.localeCompare(b.date))
}

// 계정의 구독 링크다. 아직 만들지 않았다면 null이다.
calendarRouter.get("/feed", (req, res) => {
  const account = requireAccount(req)
  res.json({ url: account.calendarFeed ? feedUrl(req, account.calendarFeed.token) : null })
})

// 계정의 링크를 만들거나 기존 링크 대신 새 링크를 만든다. 기존 링크는 바로
// 멈춘다. 데모 계정을 써 보는 모두에게 보이게 되므로 공유 데모 계정은 쓸 수 없다.
calendarRouter.post("/feed", async (req, res) => {
  const account = requireAccount(req)
  if (isDemoAccount(getDatabase(), account)) throw new HttpError(403, "데모 계정은 구독 링크를 만들 수 없어요.")
  account.calendarFeed = { token: randomBytes(24).toString("base64url"), createdAt: new Date().toISOString() }
  await saveDatabase()
  res.status(201).json({ url: feedUrl(req, account.calendarFeed.token) })
})

calendarRouter.delete("/feed", async (req, res) => {
  const account = requireAccount(req)
  if (account.calendarFeed) {
    delete account.calendarFeed
    await saveDatabase()
  }
  res.status(204).end()
})

// 구독한 앱이 가져가는 캘린더 자체다. 링크가 곧 열쇠이므로 로그인은 필요 없다.
// 바뀌거나 지워진 링크, 정지된 계정의 링크는 404로 답한다.
calendarRouter.get("/:file", (req, res) => {
  const token = /^([\w-]{20,64})\.ics$/.exec(String(req.params.file))?.[1]
  const database = getDatabase()
  const account = token ? database.accounts.find((item) => item.calendarFeed?.token === token) : undefined
  if (!account || account.suspendedAt) throw new HttpError(404, "캘린더를 찾을 수 없어요.")
  const name = `uniconnect · ${findListing(database, account)?.name ?? account.name}`
  res.type("text/calendar; charset=utf-8").send(calendarFile(feedEntries(database, account), name))
})
