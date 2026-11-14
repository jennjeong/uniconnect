import { browse, ownersOf, partnerCatalogOf } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import { notify } from "./notices.js"
import { sendInBatches } from "./reminders.js"
import { isDemoAccount } from "./reviews.js"
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Catalog } from "./owners.js"
import type { Account, Database } from "../types.js"

// 주간 요약이 새 회원을 몇 주 전까지 살피는지와 몇 개를 보여 주는지.
const weekMs = 7 * 24 * 60 * 60 * 1000
const named = 3

// 요약을 보내는 한국의 월요일. 매일 도는 cron(한국 09:00)과 계속 켜져 있는
// 서버의 매시간 타이머가 모두 sendDigests를 부른다.
const isMondayInKorea = (now: Date) => new Date(`${todayInKorea(now)}T00:00:00Z`).getUTCDay() === 1

const catalogOf = (account: Account) => partnerCatalogOf(account.role)

// 카탈로그에서 지난 한 주에 가입한 계정의 리스팅 id.
function joinedListings(database: Database, catalog: Catalog, now: Date) {
  const since = now.getTime() - weekMs
  return new Set([...ownersOf(database, catalog)].filter(([, owner]) => Date.parse(owner.createdAt) >= since).map(([id]) => id))
}

// 지난 한 주에 가입한 상대편 리스팅을 계정이 찾는 대로 보여 준다(lib/catalog.ts
// 의 browse: 계정이 보는 회원, 멈춘 것은 빼고 잘 맞는 순). 최고 셋. 새로 가입한 상대가
// 없으면 목록을 만들지 않는다(대부분의 주가 그렇다).
export function newPartners(database: Database, account: Account, now = new Date(), joined = joinedListings(database, catalogOf(account), now)) {
  if (joined.size === 0) return []
  return browse(database, catalogOf(account), account)
    .filter((listing) => joined.has(listing.id))
    .slice(0, named)
}

// 지난 한 주에 가입한 파트너 중 가장 잘 맞는 파트너가 있으면 회원에게 월요일
// 마다 한 번 이메일을 보낸다. 공용 데모 계정, 정지된 계정, 내 정보에서
// 요약을 끈 회원은 제외한다(digestOn이 계정마다 본 월요일을 기억해 매시간
// 타이머가 한 번만 보낸다). 나간 수를 답한다.
export async function sendDigests(database: Database = getDatabase(), now = new Date()) {
  if (!isMondayInKorea(now)) return 0
  const today = todayInKorea(now)
  const quiet: Account[] = []
  const due: { account: Account; partners: ReturnType<typeof newPartners> }[] = []
  const joined = { brands: joinedListings(database, "brands", now), groups: joinedListings(database, "groups", now) }
  for (const account of database.accounts) {
    if (isDemoAccount(database, account) || account.suspendedAt || account.digestOn === today) continue
    if (account.mailOff?.includes("digest")) continue
    const partners = newPartners(database, account, now, joined[catalogOf(account)])
    if (partners.length > 0) due.push({ account, partners })
    else quiet.push(account)
  }
  // 보낸 뒤에 표시하므로 실패한 메일은 그날의 다음 실행에서 다시 간다. 보내는 동안
  // 데이터를 새로 읽었을 수 있어 표시할 계정은 다시 찾는다.
  const mark = (accounts: Account[]) =>
    retryConflicts(async () => {
      const current = getDatabase()
      for (const { id } of accounts) {
        const account = current.accounts.find((item) => item.id === id)
        if (account) account.digestOn = today
      }
      await saveDatabase()
    })
  if (quiet.length > 0) await mark(quiet)
  return sendInBatches(
    due,
    ({ account, partners }) => {
      const students = account.role === "학생단체"
      const side = students ? "브랜드" : "학생단체"
      return notify(
        account,
        "digest",
        `이번 주 새로 가입한 잘 맞는 ${side} ${partners.length}곳`,
        [`지난 일주일 동안 가입한 ${side} 가운데 잘 맞는 곳이에요.`, ...partners.map((partner) => `· ${partner.name} (일치율 ${partner.score}%)`)],
        students ? "/matches" : "/groups",
      )
    },
    async (delivered) => {
      if (delivered.length > 0) await mark(delivered.map((item) => item.account))
    },
  )
}

