import { Router } from "express"

import { businessCheck } from "../lib/business.js"
import { createListing, findListing } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { geocode } from "../lib/geocode.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { brandProfile } from "../lib/brandProfile.js"
import { trustOf } from "../lib/trust.js"
import { portfolioHistory } from "../lib/portfolioHistory.js"
import { brandOffers, factLabels, snsPlatforms, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { BrandOffer, Match, Role } from "../types.js"

export const profileRouter = Router()

const rows = (value: unknown) =>
  (Array.isArray(value) ? value : []) as (Record<string, unknown> | undefined)[]

// 브라우저가 줄인 로고로, 약 100KB 이하의 PNG, JPEG, WebP 데이터 URL이다.
// SVG 같은 것은 스크립트를 담을 수 있으므로 받지 않는다.
const logoPattern = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/
const logoMaxLength = 140_000

function parseLogo(value: unknown) {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string" || value.length > logoMaxLength || !logoPattern.test(value)) {
    throw new HttpError(400, "로고는 PNG, JPG, WebP 이미지를 100KB 이하로 올려 주세요.")
  }
  return value
}

// 브랜드의 제안 한 줄을 행에서 만든다("할인 쿠폰 150장 · 현금 후원 20만원").
// 카드에 들어가는 만큼 보여 주고 나머지는 몇 개 더 있는지 알려 준다.
export function offerLine(offers: BrandOffer[]) {
  const parts = offers.map((item) => (item.detail ? `${item.kind} ${item.detail}` : item.kind))
  let shown = parts.length
  while (shown > 1 && parts.slice(0, shown).join(" · ").length > 40) shown -= 1
  const line = parts.slice(0, shown).join(" · ")
  return shown < parts.length ? `${line} 외 ${parts.length - shown}` : line
}

// 브랜드의 제안 행이다. 행마다 목록에 있는 종류 하나를 한 번씩 쓰고 그 내용
// (30자 이하)을 붙이며, 내용이 없는 종류는 내용 없는 행으로 센다.
function parseOffers(value: unknown): BrandOffer[] {
  const seen = new Set<string>()
  const items: BrandOffer[] = []
  for (const row of Array.isArray(value) ? value : []) {
    const kind = text(typeof row === "string" ? row : (row as Record<string, unknown> | undefined)?.kind)
    const detail = typeof row === "string" ? "" : text((row as Record<string, unknown> | undefined)?.detail)
    if (!brandOffers.includes(kind) || seen.has(kind)) continue
    if (detail.length > 30) throw new HttpError(400, "협찬 내용은 30자 이하로 적어 주세요.")
    seen.add(kind)
    items.push(detail ? { kind, detail } : { kind })
  }
  return items
}

// 계정이 직접 쓰는 리스팅의 항목이다. 브랜드는 제안을 목록에서 고르고, 태그와
// 기본 정보는 하는 일에서 계산하므로(lib/brandProfile.ts) 둘 다 직접 쓰지
// 않는다.
function parseProfile(body: unknown, role: Role) {
  const input = (body ?? {}) as Record<string, unknown>
  const brand = role === "브랜드"
  const intro = text(input.intro)
  if (intro.length < 10 || intro.length > 300) {
    throw new HttpError(400, "소개는 10자 이상 300자 이하로 적어 주세요.")
  }
  const offers = brand ? parseOffers(input.offers) : []
  if (brand && offers.length === 0) throw new HttpError(400, "제공하는 협찬을 하나 이상 골라 주세요.")
  const offer = brand ? offerLine(offers) : text(input.offer)
  if (!offer || offer.length > 60) {
    throw new HttpError(400, "협찬하면 얻는 것을 60자 이하로 적어 주세요.")
  }
  const tags = brand ? [] : rows(input.tags).map((tag) => text(tag)).filter(Boolean)
  if (tags.length > 4 || tags.some((tag) => tag.length > 12)) {
    throw new HttpError(400, "태그는 4개까지, 하나에 12자 이하로 적어 주세요.")
  }
  // 이쪽의 라벨만 순서대로 받고, 빈 것은 뺀다.
  const facts = brand
    ? []
    : factLabels[role]
        .map((label) => ({ label, value: text(rows(input.facts).find((fact) => fact?.label === label)?.value) }))
        .filter((fact) => fact.value)
  if (facts.some((fact) => fact.value.length > 40)) {
    throw new HttpError(400, "기본 정보는 항목마다 40자 이하로 적어 주세요.")
  }
  const sns = rows(input.sns)
    .map((row) => ({
      platform: text(row?.platform),
      handle: text(row?.handle),
      // 브랜드는 팔로워 수를 보여 주지 않는다.
      followers: brand ? "" : text(row?.followers),
    }))
    .filter((row) => row.handle)
  if (sns.length > 4) throw new HttpError(400, "SNS는 4개까지 등록할 수 있어요.")
  if (sns.some((row) => !snsPlatforms.includes(row.platform))) {
    throw new HttpError(400, "SNS 종류를 골라 주세요.")
  }
  if (sns.some((row) => row.handle.length > 60 || row.followers.length > 20)) {
    throw new HttpError(400, "SNS 계정은 60자, 팔로워는 20자 이하로 적어 주세요.")
  }
  const portfolio = rows(input.portfolio)
    .map((row) => ({ title: text(row?.title), detail: text(row?.detail) }))
    .filter((row) => row.title)
  if (portfolio.length > 5) throw new HttpError(400, "포트폴리오는 5개까지 등록할 수 있어요.")
  if (portfolio.some((row) => row.title.length > 40 || row.detail.length > 100)) {
    throw new HttpError(400, "포트폴리오 제목은 40자, 내용은 100자 이하로 적어 주세요.")
  }
  // 캠퍼스까지의 거리를 위한 브랜드의 매장 주소다. 빼면 기존 값을 유지하고,
  // 비우면 지운다.
  const address = role === "브랜드" && input.address !== undefined ? text(input.address) : undefined
  if (address !== undefined && address.length > 100) {
    throw new HttpError(400, "매장 주소는 100자 이하로 적어 주세요.")
  }
  return {
    logo: parseLogo(input.logo),
    address,
    intro,
    offer,
    ...(brand ? { offers } : {}),
    tags,
    facts,
    sns: sns.map(({ followers, ...row }) => (followers ? { ...row, followers } : row)),
    portfolio,
  }
}

// 주인이 보는 리스팅이다. 브랜드의 것은 계산한 기본 정보와 태그를 함께
// 보여 준다.
// 응답률과 이행률(lib/trust.ts)도 담는다.
function shownProfile(database: ReturnType<typeof getDatabase>, listing: Match) {
  const owner = database.accounts.find((account) => account.brandId === listing.id || account.groupId === listing.id)
  const shown = owner?.brandId === listing.id ? brandProfile(database, listing) : listing
  const trust = trustOf(database, owner)
  return trust ? { ...shown, trust } : shown
}

// 확인할 때마다 정부 서비스에 묻기 때문에 브랜드는 한 시간에 몇 번만 할 수 있다.
const businessChecksPerHour = createRateLimit({
  label: "사업자 등록 확인",
  limit: 10,
  windowMs: 60 * 60 * 1000,
  message: "사업자 확인을 너무 많이 했어요. 1시간 뒤에 다시 시도해 주세요.",
})

// "123-45-67890" as it shows on 내 정보.
const shownNumber = (number: string) => `${number.slice(0, 3)}-${number.slice(3, 5)}-${number.slice(5)}`

// 브랜드가 여기서 사업자를 확인할 수 있는지(키가 설정되었는지)와 이 브랜드가
// 확인된 등록 정보를 알려 준다.
profileRouter.get("/business", (req, res) => {
  const account = requireAccount(req)
  res.json({
    ready: businessCheck.ready(),
    business: account.business ? { number: shownNumber(account.business.number), verifiedAt: account.business.verifiedAt } : null,
  })
})

// 브랜드가 국세청으로 사업자등록을 확인한다. 사업자등록증에 있는 대로 번호,
// 개업일, 대표자 이름을 받는다. 일치하면 번호만 보관하고, 사업자 하나는 계정
// 하나만 확인한다. 그러면 리스팅에 사업자 확인이 표시된다. 공유 데모 브랜드는
// 할 수 없다.
profileRouter.post("/business", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (account.role !== "브랜드") throw new HttpError(403, "브랜드 계정만 사업자를 확인할 수 있어요.")
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 사업자를 확인할 수 없어요.")
  if (!businessCheck.ready()) throw new HttpError(503, "사업자 확인은 아직 준비 중이에요.")
  const number = text(req.body?.number).replace(/[-\s]/g, "")
  const startDate = text(req.body?.startDate).replace(/[-.\s]/g, "")
  const owner = text(req.body?.owner)
  if (!/^\d{10}$/.test(number)) throw new HttpError(400, "사업자등록번호 10자리를 적어 주세요.")
  if (!/^\d{8}$/.test(startDate)) throw new HttpError(400, "개업일자를 골라 주세요.")
  if (!owner || owner.length > 30) throw new HttpError(400, "대표자 성명을 적어 주세요.")
  const taken = database.accounts.some((item) => item.id !== account.id && item.business?.number === number)
  if (taken) throw new HttpError(409, "이미 다른 계정에서 확인한 사업자등록번호예요.")
  await businessChecksPerHour.take(account.id)
  let result
  try {
    result = await businessCheck.validate({ number, startDate, owner })
  } catch (error) {
    console.error(`[business] ${(error as Error).message}`)
    throw new HttpError(502, "국세청 확인을 지금 할 수 없어요. 잠시 뒤 다시 시도해 주세요.")
  }
  if (result === "invalid") {
    throw new HttpError(400, "입력한 정보로 확인되지 않았어요. 사업자등록증의 번호, 개업일자, 대표자 성명을 확인해 주세요.")
  }
  if (result === "closed") throw new HttpError(400, "폐업한 사업자로 확인돼요.")
  // 다시 찾는다. 확인하는 동안 데이터를 새로 읽었을 수 있다.
  const fresh = getDatabase().accounts.find((item) => item.id === account.id)
  if (!fresh) throw new HttpError(404, "계정을 찾을 수 없어요.")
  fresh.business = { number, verifiedAt: new Date().toISOString() }
  await saveDatabase()
  res.json({ business: { number: shownNumber(number), verifiedAt: fresh.business.verifiedAt } })
})

// 내 정보의 목록에서 잠시 숨기기다. 숨기는 동안 리스팅은 반대편의 목록(
// lib/catalog.ts의 listedTo)에서 빠지고 이 리스팅에 대한 새 제안은 거절된다.
// 진행 중인 것은 계속된다. 방문자가 데모 계정의 리스팅을 예시로 보므로 공유
// 데모 계정은 할 수 없다.
profileRouter.put("/pause", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 소개를 숨길 수 없어요.")
  const paused: unknown = req.body?.paused
  if (typeof paused !== "boolean") throw new HttpError(400, "숨길지 다시 보일지 알 수 없어요.")
  const listing = findListing(database, account)
  if (!listing) throw new HttpError(404, "숨길 소개가 아직 없어요. 내 정보에서 먼저 소개를 써 주세요.")
  if (paused) listing.pausedAt ??= new Date().toISOString()
  else delete listing.pausedAt
  await saveDatabase()
  res.json({ profile: listing })
})

// Past sponsorships or events to add to the portfolio (소개 편집's 불러오기).
profileRouter.get("/history", (req, res) => {
  const account = requireAccount(req)
  res.json({ items: portfolioHistory(getDatabase(), account) })
})

// 로그인한 계정 자신의 리스팅이다. 아직 쓰지 않았다면 null이다.
profileRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const listing = findListing(database, account)
  res.json({ profile: listing ? shownProfile(database, listing) : null })
})

// 반대편이 보는 리스팅을 저장하며, 처음이면 만든다. 새 매장 주소이거나 아직
// 위치가 없는 주소(지도 키가 설정되기 전에 저장한 것)는 아무것도 바꾸기 전에
// 먼저 지도에 위치를 잡는다(lib/geocode.ts).
profileRouter.put("/", async (req, res) => {
  const account = requireAccount(req)
  const profile = parseProfile(req.body, account.role)
  const { logo, address, ...rest } = profile
  const before = findListing(getDatabase(), account)?.location
  const placed = address === before?.address && before?.lat !== undefined
  const place = address && !placed ? await geocode(address) : undefined
  const database = getDatabase()
  const listing = findListing(database, account) ?? createListing(database, account)
  Object.assign(listing, rest)
  // 브랜드의 것은 보여 줄 때마다 계산한다.
  if (account.role === "브랜드") {
    delete listing.facts
    listing.tags = []
  }
  // 빼 두면 로고는 그대로 두고, null이면 지운다.
  if (logo === null) delete listing.logo
  else if (logo) listing.logo = logo
  if (address === "") delete listing.location
  else if (address && (address !== listing.location?.address || place)) listing.location = { address, ...place }
  await saveDatabase()
  res.json({ profile: shownProfile(database, listing) })
})
