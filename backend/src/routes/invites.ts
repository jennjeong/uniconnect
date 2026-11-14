import { randomBytes } from "node:crypto"
import { Router, type Request } from "express"

import { findListing, withLiveEvent } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { applicationsOf, holdApplication, parseDocument } from "../lib/applications.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { assertLinkable } from "../lib/shopInvites.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import { isDemoAccount } from "../lib/reviews.js"
import type { Database, ShopInvite } from "../types.js"

export const invitesRouter = Router()

// 학생단체 하나가 초대할 수 있는 매장의 최대 수다(409 응답에는 100이라고 나온다).
export const inviteLimit = 100

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

// 초대하는 단체가 초대장에 보여 주는 자기 정보다. 리스팅과 다음 행사를
// 보여 주고, 리스팅이 아직 없으면 이름과 학교만 보여 준다.
function inviterOf(database: Database, invite: ShopInvite) {
  const account = database.accounts.find((item) => item.id === invite.accountId)
  // 정지된 단체는 다른 곳에서처럼 보여 주지 않는다.
  if (!account || account.suspendedAt) return undefined
  const listing = findListing(database, account)
  if (!listing) return { name: account.name, school: account.school, category: account.type }
  const { score: _score, reasons: _reasons, ...shown } = withLiveEvent(database, listing)
  return shown
}

// 초대 페이지가 보여 주는 모습의 초대장이다. 누구의 초대인지, 매장이
// 합류했는지(지금 보는 브랜드와 연결됐는지, 다른 브랜드와 연결됐는지)를 담는다.
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

// 학생단체가 가까운 순에서 Kakao 장소 ID로 매장을 초대한다. 같은 매장을 다시
// 초대하면 같은 초대장을 돌려준다.
invitesRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체 계정으로 가게를 초대할 수 있어요.")
  const database = getDatabase()
  // 초대는 실제 매장 주인에게 가므로 회원이 보낸 것이어야 한다.
  if (isDemoAccount(database, account)) {
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

// 링크를 가진 누구나 여는 초대 페이지다. 매장 주인이 가입하기 전에
// 읽어 본다.
invitesRouter.get("/:code", (req, res) => {
  const database = getDatabase()
  res.json(inviteView(database, findInvite(database, req.params.code), req))
})

// 브랜드 계정이 초대를 받는다. 그 계정의 리스팅(아직 없으면 지금 만든다)이
// 그 매장이 되어, 근처 단체가 합류를 보고 제안을 보낼 수 있다. 그 매장을
// 초대한 모든 단체가 합류 소식을 받는다.
const linksPerDay = createRateLimit({
  label: "가게 연결 신청",
  limit: 5,
  windowMs: 24 * 60 * 60 * 1000,
  message: "가게 연결 신청을 너무 많이 보냈어요. 내일 다시 보내 주세요.",
})

invitesRouter.post("/:code/accept", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "브랜드") throw new HttpError(403, "브랜드 계정으로 가게를 연결할 수 있어요.")
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 가게를 연결할 수 없어요.")
  const invite = findInvite(database, req.params.code)
  const listing = assertLinkable(database, account, invite)
  // 두 번 받아도 달라지는 것이 없다.
  if (listing?.kakaoPlaceId === invite.placeId) {
    res.json({ ...inviteView(database, invite, req), listing })
    return
  }
  // 사업자 확인은 그 가게의 주인임을 보여 주지 않는다. 가입과 같이 운영자가
  // 서류를 보고 연결한다.
  const assertNotWaiting = () => {
    const waiting = applicationsOf(database).some((item) => item.linkAccountId === account.id && item.invite === invite.code)
    if (waiting) throw new HttpError(409, "이미 서류를 보냈어요. 운영자가 확인하면 메일로 알려 드려요.")
  }
  // 이미 낸 신청이나 빠진 서류는 하루 횟수를 쓰지 않는다. 횟수를 세는 사이에
  // 다른 요청이 신청을 남겼을 수 있어 센 뒤 다시 본다.
  assertNotWaiting()
  const document = parseDocument(req.body?.document, "사업자등록증이나 재직 서류를 올려 주세요.")
  await linksPerDay.take(account.id)
  assertNotWaiting()
  await holdApplication(database, saveDatabase, document, {
    kind: "shop",
    name: account.name,
    email: account.email,
    linkAccountId: account.id,
    invite: invite.code,
  })
  res.status(202).json({ pending: true })
})
