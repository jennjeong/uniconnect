import { browse, ownerOf } from "./catalog.js"
import { todayInKorea } from "./dates.js"
import { notify } from "./notices.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

// 주간 요약이 새 회원을 몇 주 전까지 살피는지와 몇 개를 보여 주는지.
const weekMs = 7 * 24 * 60 * 60 * 1000
const named = 3

// 요약을 보내는 한국의 월요일. 매일 도는 cron(한국 09:00)과 계속 켜져 있는
// 서버의 매시간 타이머가 모두 sendDigests를 부른다.
const isMondayInKorea = (now: Date) => new Date(`${todayInKorea(now)}T00:00:00Z`).getUTCDay() === 1

// 지난 한 주에 가입한 상대편 리스팅을 계정이 찾는 대로 보여 준다(lib/catalog.ts
// 의 browse: 계정이 보는 회원, 멈춘 것은 빼고 잘 맞는 순). 최고 셋.
export function newPartners(database: Database, account: Account, now = new Date()) {
  const catalog = account.role === "학생단체" ? "brands" : "groups"
  const since = now.getTime() - weekMs
  return browse(database, catalog, account)
    .filter((listing) => {
      const owner = ownerOf(database, catalog, listing)
      return owner !== undefined && Date.parse(owner.createdAt) >= since
    })
    .slice(0, named)
}

// 지난 한 주에 가입한 파트너 중 가장 잘 맞는 파트너가 있으면 회원에게 월요일
// 마다 한 번 이메일을 보낸다. 공용 데모 계정, 정지된 계정, 내 정보에서
// 요약을 끈 회원은 제외한다(digestOn이 계정마다 본 월요일을 기억해 매시간
// 타이머가 한 번만 보낸다). 나간 수를 답한다.
export async function sendDigests(database: Database = getDatabase(), now = new Date()) {
  if (!isMondayInKorea(now)) return 0
  const today = todayInKorea(now)
  const demo = new Set(Object.values(database.demoAccountIds))
  const looked: Account[] = []
  const due: { account: Account; partners: ReturnType<typeof newPartners> }[] = []
  for (const account of database.accounts) {
    if (demo.has(account.id) || account.suspendedAt || account.digestOn === today) continue
    if (account.mailOff?.includes("digest")) continue
    account.digestOn = today
    looked.push(account)
    const partners = newPartners(database, account, now)
    if (partners.length > 0) due.push({ account, partners })
  }
  if (looked.length === 0) return 0
  await saveDatabase()
  for (const { account, partners } of due) {
    const students = account.role === "학생단체"
    const side = students ? "브랜드" : "학생단체"
    void notify(
      account,
      "digest",
      `이번 주 새로 가입한 잘 맞는 ${side} ${partners.length}곳`,
      [
        `지난 일주일 동안 가입한 ${side} 가운데 잘 맞는 곳이에요.`,
        ...partners.map((partner) => `· ${partner.name} (일치율 ${partner.score}%)`),
      ],
      students ? "/matches" : "/groups",
    )
  }
  return due.length
}
