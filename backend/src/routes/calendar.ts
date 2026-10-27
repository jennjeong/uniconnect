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

// How far back a subscribed calendar keeps past days.
const keepDays = 90

// The address calendar apps subscribe to: on the site's own address
// (SITE_URL) when it is set, else the one this request came to.
const feedUrl = (req: Request, token: string) =>
  `${config.siteUrl?.replace(/\/$/, "") ?? `${req.protocol}://${req.get("host")}`}/api/calendar/${token}.ics`

// What an account's subscribed calendar holds, from 90 days back on: its
// events or campaigns, and its confirmed sponsorships' days (a brand
// sponsoring a group's event, a group taking part in a brand's campaign),
// as the 캘린더에 추가 sheet lists them.
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

// The account's subscription link, or null before it made one.
calendarRouter.get("/feed", (req, res) => {
  const account = requireAccount(req)
  res.json({ url: account.calendarFeed ? feedUrl(req, account.calendarFeed.token) : null })
})

// Makes the account's link, or a new one in its place: the old one stops at
// once. Not for the shared demo accounts, as everyone trying them would see it.
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

// The calendar itself, for the app that subscribed: no login, as the link is
// the key. A link replaced or deleted, or a stopped account's, answers 404.
calendarRouter.get("/:file", (req, res) => {
  const token = /^([\w-]{20,64})\.ics$/.exec(String(req.params.file))?.[1]
  const database = getDatabase()
  const account = token ? database.accounts.find((item) => item.calendarFeed?.token === token) : undefined
  if (!account || account.suspendedAt) throw new HttpError(404, "캘린더를 찾을 수 없어요.")
  const name = `uniconnect · ${findListing(database, account)?.name ?? account.name}`
  res.type("text/calendar; charset=utf-8").send(calendarFile(feedEntries(database, account), name))
})
