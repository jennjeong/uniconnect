import { isDemoAccount } from "./reviews.js"
import { dismissReasons } from "./validation.js"
import type { Account, Database } from "../types.js"

// 관심 없음(#341, routes/dismissed.ts): 회원이 추천에서 뺀 상대.
export const maxDismissed = 200

export const dismissedIds = (database: Database, account: Account | undefined) =>
  new Set((account ? database.dismissed?.[account.id] ?? [] : []).map((item) => item.listingId))

// 이유별로 몇 번 골랐는지, 역할별로(분석 화면). 누가 누구를 뺐는지는 담지 않는다.
export function dismissStats(database: Database) {
  const counts = { 학생단체: {} as Record<string, number>, 브랜드: {} as Record<string, number> }
  for (const [accountId, list] of Object.entries(database.dismissed ?? {})) {
    const account = database.accounts.find((item) => item.id === accountId)
    if (!account || isDemoAccount(database, account)) continue
    const side = account.role === "브랜드" ? counts.브랜드 : counts.학생단체
    for (const { reason } of list) side[reason] = (side[reason] ?? 0) + 1
  }
  return dismissReasons.map((reason) => ({ reason, groups: counts.학생단체[reason] ?? 0, brands: counts.브랜드[reason] ?? 0 }))
}
