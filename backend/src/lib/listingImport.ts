import { randomUUID } from "node:crypto"

import { industryOf } from "./catalog.js"
import { accountTypes } from "./validation.js"
import type { Account, Database, Match, Role } from "../types.js"

// 운영자 대량 등록(#350). 콘솔이 CSV(엑셀에서 CSV로 저장한 파일)를 읽어 행을 보내면,
// 행마다 검사해 틀린 행은 이유와 함께 알리고, 맞는 행은 리스팅으로 넣는다.
// 넣은 리스팅은 주인 계정이 없으므로 예시와 같이 방문자와 데모 계정에게만 보인다
// (lib/catalog.ts shownTo: 회원에게는 회원의 리스팅만 보인다). 주인이 가입하면 그때
// 회원의 리스팅이 새로 생긴다. 예시 초기화(resetExamples)는 시드의 리스팅만 바꾸므로
// 넣은 것은 남고, 묶음째 지울 수 있다.

export const importLimits = { rows: 500, name: 40, place: 60, intro: 300, offer: 60, tags: 4, tag: 12 }

export type ImportRow = Record<string, unknown>
export type ImportResult = { row: number; name: string; ok: boolean; message?: string }

const sides: Record<string, Role> = { 학생단체: "학생단체", 단체: "학생단체", 브랜드: "브랜드" }

const cell = (value: unknown) => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "")

const splitTags = (value: string) =>
  value
    .split(/[,·#\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean)

// 한 행을 검사해 리스팅을 만든다. 틀리면 운영자가 읽을 이유를 돌려준다.
export function listingFromRow(row: ImportRow): Match | string {
  const role = sides[cell(row.side)]
  if (!role) return "구분은 학생단체 또는 브랜드로 적어 주세요."
  const name = cell(row.name)
  if (!name || name.length > importLimits.name) return "이름은 1~40자로 적어 주세요."
  const type = cell(row.type)
  if (!accountTypes[role].includes(type)) return "유형이 목록에 없어요. 양식의 유형 중 하나로 적어 주세요."
  const place = cell(row.place)
  if (role === "학생단체" && !place) return "학생단체는 학교를 적어 주세요."
  if (place.length > importLimits.place) return "학교나 주소는 60자까지 적을 수 있어요."
  const intro = cell(row.intro)
  if (intro.length > importLimits.intro) return "소개는 300자까지 적을 수 있어요."
  const offer = cell(row.offer)
  if (offer.length > importLimits.offer) return "제공 · 모집 내용은 60자까지 적을 수 있어요."
  const tags = splitTags(cell(row.tags))
  if (tags.length > importLimits.tags || tags.some((tag) => tag.length > importLimits.tag)) return "태그는 12자 이하로 4개까지 적어 주세요."
  const students = role === "학생단체"
  return {
    id: `${students ? "group" : "brand"}-import-${randomUUID().slice(0, 8)}`,
    name,
    category: type,
    industry: industryOf({ role, type } as Account),
    offer,
    score: 70,
    tags,
    ...(intro ? { intro } : {}),
    ...(students ? { school: place } : { popularity: 0, ...(place ? { location: { address: place } } : {}) }),
  }
}

const catalogOf = (database: Database, listing: Match) => (listing.id.startsWith("group-") ? database.groups : database.brands)

// 행을 모두 검사하고(dryRun이 아니면) 맞는 행을 넣는다. 같은 쪽에 이미 있거나 파일 안에서
// 겹치는 이름은 넣지 않는다.
export function importListings(database: Database, rows: ImportRow[], dryRun: boolean, now = new Date()) {
  const batch = `import-${now.toISOString().slice(0, 10)}-${randomUUID().slice(0, 6)}`
  const taken = {
    학생단체: new Set(database.groups.map((item) => item.name.toLowerCase())),
    브랜드: new Set(database.brands.map((item) => item.name.toLowerCase())),
  }
  const results: ImportResult[] = []
  const made: Match[] = []
  rows.forEach((row, index) => {
    const listing = listingFromRow(row)
    const name = cell(row.name)
    if (typeof listing === "string") {
      results.push({ row: index + 1, name, ok: false, message: listing })
      return
    }
    const names = listing.id.startsWith("group-") ? taken.학생단체 : taken.브랜드
    if (names.has(listing.name.toLowerCase())) {
      results.push({ row: index + 1, name, ok: false, message: "같은 이름이 이미 있어요." })
      return
    }
    names.add(listing.name.toLowerCase())
    listing.imported = { at: now.toISOString(), batch }
    made.push(listing)
    results.push({ row: index + 1, name, ok: true })
  })
  if (!dryRun) for (const listing of made) catalogOf(database, listing).push(listing)
  return { batch, created: dryRun ? 0 : made.length, valid: made.length, results }
}

// 넣은 묶음들, 최근 것부터.
export function importBatches(database: Database) {
  const batches = new Map<string, { batch: string; at: string; groups: number; brands: number }>()
  for (const listing of [...database.groups, ...database.brands]) {
    if (!listing.imported) continue
    const entry = batches.get(listing.imported.batch) ?? { batch: listing.imported.batch, at: listing.imported.at, groups: 0, brands: 0 }
    if (listing.id.startsWith("group-")) entry.groups += 1
    else entry.brands += 1
    batches.set(listing.imported.batch, entry)
  }
  return [...batches.values()].sort((a, b) => b.at.localeCompare(a.at))
}

// 묶음을 지운다. 제안이나 찜, 관심 없음이 걸린 리스팅은 남기고 그 수를 돌려준다.
export function removeBatch(database: Database, batch: string) {
  const used = new Set<string>([
    ...database.requests.map((item) => item.brandId),
    ...database.offers.map((item) => item.groupId),
    ...database.conversations.flatMap((item) => [item.groupId, item.brandId]),
    ...Object.values(database.saved ?? {}).flat(),
    ...Object.values(database.dismissed ?? {}).flatMap((list) => list.map((item) => item.listingId)),
  ])
  let removed = 0
  let kept = 0
  const keep = (listing: Match) => {
    if (listing.imported?.batch !== batch) return true
    if (used.has(listing.id)) {
      kept += 1
      return true
    }
    removed += 1
    return false
  }
  database.groups = database.groups.filter(keep)
  database.brands = database.brands.filter(keep)
  return { removed, kept }
}
