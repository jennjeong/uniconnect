import { Router } from "express"

import { createListing, findListing } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { geocode } from "../lib/geocode.js"
import { factLabels, snsPlatforms, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Role } from "../types.js"

export const profileRouter = Router()

const rows = (value: unknown) =>
  (Array.isArray(value) ? value : []) as (Record<string, unknown> | undefined)[]

// A logo the browser resized: a PNG, JPEG or WebP data URL of about 100KB
// at most. SVG and the like are refused, since they can carry scripts.
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

// The parts of a listing an account writes itself.
function parseProfile(body: unknown, role: Role) {
  const input = (body ?? {}) as Record<string, unknown>
  const intro = text(input.intro)
  if (intro.length < 10 || intro.length > 300) {
    throw new HttpError(400, "소개는 10자 이상 300자 이하로 적어 주세요.")
  }
  const offer = text(input.offer)
  if (!offer || offer.length > 60) {
    const label = role === "학생단체" ? "협찬하면 얻는 것" : "제공하는 협찬"
    throw new HttpError(400, `${label}을 60자 이하로 적어 주세요.`)
  }
  const tags = rows(input.tags).map((tag) => text(tag)).filter(Boolean)
  if (tags.length > 4 || tags.some((tag) => tag.length > 12)) {
    throw new HttpError(400, "태그는 4개까지, 하나에 12자 이하로 적어 주세요.")
  }
  // Only this side's labels, in their order; blank ones are left out.
  const facts = factLabels[role]
    .map((label) => ({ label, value: text(rows(input.facts).find((fact) => fact?.label === label)?.value) }))
    .filter((fact) => fact.value)
  if (facts.some((fact) => fact.value.length > 40)) {
    throw new HttpError(400, "기본 정보는 항목마다 40자 이하로 적어 주세요.")
  }
  const sns = rows(input.sns)
    .map((row) => ({
      platform: text(row?.platform),
      handle: text(row?.handle),
      followers: text(row?.followers),
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
  // A brand's store address, for the distance to campuses: left out keeps
  // it, empty removes it.
  const address = role === "브랜드" && input.address !== undefined ? text(input.address) : undefined
  if (address !== undefined && address.length > 100) {
    throw new HttpError(400, "매장 주소는 100자 이하로 적어 주세요.")
  }
  return {
    logo: parseLogo(input.logo),
    address,
    intro,
    offer,
    tags,
    facts,
    sns: sns.map(({ followers, ...row }) => (followers ? { ...row, followers } : row)),
    portfolio,
  }
}

// The logged-in account's own listing, or null before it has written one.
profileRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  res.json({ profile: findListing(getDatabase(), account) ?? null })
})

// Saves the listing the other side sees, creating it the first time. A store
// address that is new, or still has no place (saved before the map key was
// set), is placed on the map first (lib/geocode.ts), before anything changes.
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
  // A logo left out stays as it was; null removes it.
  if (logo === null) delete listing.logo
  else if (logo) listing.logo = logo
  if (address === "") delete listing.location
  else if (address && (address !== listing.location?.address || place)) listing.location = { address, ...place }
  await saveDatabase()
  res.json({ profile: listing })
})
