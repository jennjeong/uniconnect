import { randomBytes } from "node:crypto"
import { Router, type Request } from "express"

import { createListing, findListing, withLiveEvent } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database, ShopInvite } from "../types.js"

export const invitesRouter = Router()

// The most shops one student group may have invited (the 409 says 100).
export const inviteLimit = 100

const isDemo = (database: Database, account: Account) => Object.values(database.demoAccountIds).includes(account.id)

function newCode(database: Database) {
  let code: string
  do code = randomBytes(6).toString("base64url")
  while (database.invites.some((invite) => invite.code === code))
  return code
}

function findInvite(database: Database, code: unknown) {
  const invite = database.invites.find((item) => item.code === String(code))
  if (!invite) throw new HttpError(404, "초대 링크를 찾을 수 없어요. 링크를 다시 확인해 주세요.")
  return invite
}

// What the inviting group shows of itself on the invitation: its listing
// with its next event, or only its name and school before it has one.
function inviterOf(database: Database, invite: ShopInvite) {
  const account = database.accounts.find((item) => item.id === invite.accountId)
  if (!account) return undefined
  const listing = findListing(database, account)
  if (!listing) return { name: account.name, school: account.school, category: account.type }
  const { score: _score, reasons: _reasons, ...shown } = withLiveEvent(database, listing)
  return shown
}

// An invitation as its page shows it: whose it is and whether the shop has
// joined (linked to the brand looking, or to another).
function inviteView(database: Database, invite: ShopInvite, req: Request) {
  const holder = database.brands.find((brand) => brand.kakaoPlaceId === invite.placeId)
  const mine = req.account?.role === "브랜드" && holder !== undefined && holder.id === req.account.brandId
  return {
    invite: {
      code: invite.code,
      placeUrl: invite.placeUrl,
      createdAt: invite.createdAt,
      joined: holder ? (mine ? "you" : "other") : null,
    },
    group: inviterOf(database, invite),
  }
}

// A student group invites a shop from 가까운 순 by its Kakao place ID; asked
// again for the same shop, it gets the same invitation back.
invitesRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체 계정으로 가게를 초대할 수 있어요.")
  const database = getDatabase()
  // An invitation reaches a real shop's owner, so it comes from a member.
  if (isDemo(database, account)) {
    throw new HttpError(403, "데모 계정으로는 실제 가게를 초대할 수 없어요. 가입하면 우리 단체 이름으로 초대할 수 있어요.")
  }
  const placeId = String(req.body?.placeId ?? "")
  if (!/^\d{1,15}$/.test(placeId)) throw new HttpError(400, "초대할 가게를 다시 골라 주세요.")
  const own = database.invites.filter((invite) => invite.accountId === account.id)
  const existing = own.find((invite) => invite.placeId === placeId)
  if (existing) {
    res.json({ invite: existing })
    return
  }
  if (own.length >= inviteLimit) throw new HttpError(409, "가게는 100곳까지 초대할 수 있어요.")
  const invite: ShopInvite = {
    code: newCode(database),
    accountId: account.id,
    placeId,
    placeUrl: `https://place.map.kakao.com/${placeId}`,
    createdAt: new Date().toISOString(),
  }
  database.invites.push(invite)
  await saveDatabase()
  res.status(201).json({ invite })
})

// The invitation page, open to anyone with the link: the shop owner reads it
// before signing up.
invitesRouter.get("/:code", (req, res) => {
  const database = getDatabase()
  res.json(inviteView(database, findInvite(database, req.params.code), req))
})

// A brand account takes the invitation: its listing (made now if it has
// none yet) becomes that shop, so groups nearby see it joined and can send
// proposals. Every group that invited the shop hears about it.
invitesRouter.post("/:code/accept", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "브랜드") throw new HttpError(403, "브랜드 계정으로 가게를 연결할 수 있어요.")
  const database = getDatabase()
  if (isDemo(database, account)) throw new HttpError(403, "데모 계정은 가게를 연결할 수 없어요.")
  const invite = findInvite(database, req.params.code)
  const listing = findListing(database, account)
  const holder = database.brands.find((brand) => brand.kakaoPlaceId === invite.placeId)
  if (holder && holder.id !== listing?.id) throw new HttpError(409, "이미 다른 브랜드와 연결된 가게예요.")
  if (listing?.kakaoPlaceId && listing.kakaoPlaceId !== invite.placeId) {
    throw new HttpError(409, "이미 다른 가게와 연결된 브랜드예요.")
  }
  const brand = listing ?? createListing(database, account)
  brand.kakaoPlaceId = invite.placeId
  const now = new Date().toISOString()
  const answered = database.invites.filter((item) => item.placeId === invite.placeId && !item.acceptedAt)
  for (const item of answered) {
    item.acceptedAt = now
    item.brandId = brand.id
  }
  await saveDatabase()
  for (const item of answered) {
    void notify(
      database.accounts.find((other) => other.id === item.accountId),
      "proposals",
      "초대한 가게가 uniconnect에 가입했어요",
      [`${brand.name}에서 초대를 받고 uniconnect에 가입했어요.`, "추천 매칭의 가까운 순에서 바로 협찬을 제안할 수 있어요."],
      `/matches/${encodeURIComponent(brand.id)}`,
    )
  }
  res.json({ ...inviteView(database, invite, req), listing: brand })
})
