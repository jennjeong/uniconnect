import { randomUUID } from "node:crypto"

import { browse } from "./catalog.js"
import { HttpError } from "./errors.js"
import { notify } from "./notices.js"
import { mailBatch } from "./reminders.js"
import { eventKinds, text } from "./validation.js"
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Account, Database, Industry, Match, SavedSearch } from "../types.js"

// 관심 조건 저장 알림이다(#338). 회원이 상대 목록의 조건을 저장하면, 그 조건에 맞는 상대가
// 새로 보일 때 알린다. 화면의 필터는 브라우저에서 돌므로, 서버가 직접 맞춰 볼 수 있는
// 조건만 저장한다: 검색어, 업종, (단체 목록이면) 다음 행사의 종류와 학교.
export const searchLimits = { perAccount: 5, name: 30, query: 50, known: 1000, listed: 5 }

const industries: Industry[] = ["cafe", "photo", "wellness", "performance", "content", "sports", "beauty", "education"]

export const searchCatalog = (account: Account) => (account.role === "학생단체" ? ("brands" as const) : ("groups" as const))

type Criteria = Pick<SavedSearch, "query" | "industry" | "kind" | "school">

// 저장할 조건을 읽는다. 하나는 있어야 한다. 단체를 찾는 브랜드만 행사 종류와 학교를 쓴다.
export function parseCriteria(body: unknown, account: Account): Criteria & { name?: string } {
  const input = (body ?? {}) as Record<string, unknown>
  const groups = searchCatalog(account) === "groups"
  const query = text(input.query).replace(/\s+/g, " ")
  const industry = text(input.industry)
  const kind = text(input.kind)
  const school = text(input.school)
  const name = text(input.name)
  if (query.length > searchLimits.query) throw new HttpError(400, "검색어는 50자 이하로 적어 주세요.")
  if (name.length > searchLimits.name) throw new HttpError(400, "조건 이름은 30자 이하로 적어 주세요.")
  if (industry && !industries.includes(industry as Industry)) throw new HttpError(400, "업종을 목록에서 골라 주세요.")
  if (kind && (!groups || !(eventKinds as readonly string[]).includes(kind))) throw new HttpError(400, "행사 종류를 목록에서 골라 주세요.")
  if (school && (!groups || school.length > 40)) throw new HttpError(400, "학교를 다시 확인해 주세요.")
  if (!query && !industry && !kind && !school) throw new HttpError(400, "저장할 조건을 하나 이상 골라 주세요.")
  return {
    ...(name ? { name } : {}),
    ...(query ? { query } : {}),
    ...(industry ? { industry: industry as Industry } : {}),
    ...(kind ? { kind } : {}),
    ...(school ? { school } : {}),
  }
}

// 리스팅이 조건에 맞는지. 검색어는 화면의 검색(frontend lib/search.ts의 matchesQuery)처럼
// 모든 단어가 이름, 종류, 제공 내용, 학교, 다음 행사, 태그 어딘가에 있어야 한다.
export function matchesCriteria(listing: Match, criteria: Criteria) {
  if (criteria.industry && listing.industry !== criteria.industry) return false
  if (criteria.kind && listing.eventKind !== criteria.kind) return false
  if (criteria.school && listing.school !== criteria.school) return false
  const words = (criteria.query ?? "").toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const haystack = [listing.name, listing.category, listing.offer, listing.school, listing.eventName, listing.eventKind, ...(listing.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}

// 계정이 지금 찾을 수 있는 상대 중 조건에 맞는 것(lib/catalog.ts의 browse: 회원은 회원만,
// 멈추거나 막은 상대는 빼고 잘 맞는 순).
export const matchingListings = (database: Database, account: Account, criteria: Criteria) =>
  browse(database, searchCatalog(account), account).filter((listing) => matchesCriteria(listing, criteria))

export const searchesOf = (database: Database, accountId: string) => (database.savedSearches ??= {})[accountId] ?? []

// 저장할 때 지금 맞는 상대는 이미 아는 것으로 둔다. 그 뒤에 새로 보이는 상대만 알린다.
export function addSearch(database: Database, account: Account, criteria: Criteria & { name?: string }, now = new Date()) {
  const list = searchesOf(database, account.id)
  if (list.length >= searchLimits.perAccount) throw new HttpError(409, "관심 조건은 5개까지 저장할 수 있어요. 쓰지 않는 조건을 지워 주세요.")
  const same = (item: SavedSearch) =>
    item.query === criteria.query && item.industry === criteria.industry && item.kind === criteria.kind && item.school === criteria.school
  if (list.some(same)) throw new HttpError(409, "같은 조건을 이미 저장했어요.")
  const search: SavedSearch = {
    id: randomUUID(),
    ...criteria,
    known: matchingListings(database, account, criteria).map((listing) => listing.id).slice(0, searchLimits.known),
    fresh: [],
    createdAt: now.toISOString(),
  }
  database.savedSearches![account.id] = [...list, search]
  return search
}

// 화면에 보이는 모양이다. 지금 맞는 수와, 아직 보지 않은 새 상대 중 지금도 찾을 수 있는 것.
export function searchView(database: Database, account: Account, search: SavedSearch) {
  const matches = matchingListings(database, account, search)
  const ids = new Set(matches.map((listing) => listing.id))
  const { known: _known, fresh, ...shown } = search
  return { ...shown, matchCount: matches.length, fresh: fresh.filter((id) => ids.has(id)) }
}

// 저장한 조건에 새로 맞는 상대를 찾아 계정마다 한 통으로 알린다. 받는 쪽이 '추천 요약'
// 메일(digest)을 끄면 메일은 가지 않지만, 새 상대는 목록의 fresh에 그대로 쌓인다. 데모
// 계정과 정지된 계정은 건너뛴다. 메일이 실패해도 찾은 상대는 기록해 같은 상대로 다시
// 알리지 않는다(목록에는 남는다). 크론(routes/cron.ts)과 오래 떠 있는 서버(index.ts)가
// 부른다. 보낸 메일 수를 돌려준다.
export async function sendSearchAlerts(now = new Date()) {
  const found = await retryConflicts(async () => {
    const database = getDatabase()
    const demo = new Set(Object.values(database.demoAccountIds))
    const due: { account: Account; lines: string[]; count: number }[] = []
    for (const [accountId, list] of Object.entries(database.savedSearches ?? {})) {
      const account = database.accounts.find((item) => item.id === accountId)
      if (!account || demo.has(account.id) || account.suspendedAt) continue
      const lines: string[] = []
      let count = 0
      for (const search of list) {
        const known = new Set(search.known)
        const fresh = matchingListings(database, account, search).filter((listing) => !known.has(listing.id))
        if (fresh.length === 0) continue
        search.known = [...search.known, ...fresh.map((listing) => listing.id)].slice(-searchLimits.known)
        search.fresh = [...new Set([...search.fresh, ...fresh.map((listing) => listing.id)])].slice(-searchLimits.known)
        search.notifiedAt = now.toISOString()
        count += fresh.length
        lines.push(`'${labelOf(search)}': ${fresh.slice(0, searchLimits.listed).map((listing) => listing.name).join(", ")}`)
        if (fresh.length > searchLimits.listed) lines.push(`그 밖에 ${fresh.length - searchLimits.listed}곳이 더 있어요.`)
      }
      if (count > 0) due.push({ account, lines, count })
    }
    if (due.length > 0) await saveDatabase()
    return due
  })
  let sent = 0
  for (let start = 0; start < found.length; start += mailBatch) {
    const batch = found.slice(start, start + mailBatch)
    const answers = await Promise.all(
      batch.map(({ account, lines, count }) =>
        notify(
          account,
          "digest",
          "관심 조건에 맞는 새 상대가 있어요",
          [`저장한 관심 조건에 맞는 새 상대가 ${count}곳 있어요.`, ...lines],
          searchCatalog(account) === "brands" ? "/matches" : "/groups",
        ),
      ),
    )
    sent += answers.filter(Boolean).length
  }
  return sent
}

// 메일에 적는 조건의 이름: 붙인 이름, 없으면 검색어.
export const labelOf = (search: SavedSearch) => search.name ?? search.query ?? "관심 조건"
