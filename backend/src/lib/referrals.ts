import { randomBytes } from "node:crypto"

import { grantPartners } from "./adminTools.js"
import { notify } from "./notices.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Database } from "../types.js"

// 브랜드가 자기 링크로 가입해 협찬까지 이어진 계정마다 받는 캠퍼스 파트너스
// 일수. 학생 단체는 무료로 쓰므로 단체의 것은 세기만 한다.
export const referralRewardDays = 30

// 어느 화면에서나 똑같이 읽히는 글자. 0/O, 1/I/L은 뺀다.
const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// 계정의 초대 코드. 처음 요청할 때 만든다.
export function referralCodeOf(database: Database, account: Account) {
  if (account.referralCode) return account.referralCode
  let code = ""
  do {
    code = [...randomBytes(8)].map((byte) => letters[byte % letters.length]).join("")
  } while (database.accounts.some((item) => item.referralCode === code))
  account.referralCode = code
  return code
}

// 코드를 가진 회원. 데모 계정이나 정지된 계정은 제외한다.
export function referrerOf(database: Database, code: unknown) {
  if (typeof code !== "string" || !/^[A-Z0-9]{8}$/.test(code)) return undefined
  const account = database.accounts.find((item) => item.referralCode === code)
  return account && !isDemoAccount(database, account) && !account.suspendedAt ? account : undefined
}

// 협찬의 전자계약서를 양쪽이 확인하면(브랜드는 수수료를 낸 뒤) 누군가의
// 링크로 가입했고 아직 협찬이 없던 쪽마다 그 누군가에게 한 번 보상한다.
// 브랜드에는 파트너스 일수다. 초대한 계정 자신과의 협찬에는 보상이 없어
// 계정이 스스로 파트너를 초대할 수 없다. 누가 누구 덕에 보상받았는지
// 답하여 알릴 수 있게 한다.
export function rewardReferrals(database: Database, accounts: [Account | undefined, Account | undefined], now = new Date()) {
  const rewarded: { referrer: Account; joined: Account; days: number }[] = []
  for (const [index, joined] of accounts.entries()) {
    if (!joined?.referredBy || joined.referralRewardedAt) continue
    if (accounts[1 - index]?.id === joined.referredBy) continue
    joined.referralRewardedAt = now.toISOString()
    const referrer = database.accounts.find((item) => item.id === joined.referredBy)
    if (!referrer || referrer.suspendedAt) continue
    const days = referrer.role === "브랜드" ? referralRewardDays : 0
    if (days) grantPartners(database, referrer, days, now, "친구 초대 보상")
    rewarded.push({ referrer, joined, days })
  }
  return rewarded
}

// 내 정보에 보이는 것: 코드, 그것으로 가입한 수, 그중 협찬을 한 수(각각은
// 브랜드에게 보상이다).
export function referralStats(database: Database, account: Account) {
  const joined = database.accounts.filter((item) => item.referredBy === account.id)
  return {
    code: referralCodeOf(database, account),
    joined: joined.length,
    rewarded: joined.filter((item) => item.referralRewardedAt).length,
    rewardDays: account.role === "브랜드" ? referralRewardDays : 0,
  }
}

// 보상이 저장되면 보상받은 초대자마다 이메일을 보낸다.
export function tellReferrers(rewarded: ReturnType<typeof rewardReferrals>) {
  for (const { referrer, joined, days } of rewarded) {
    void notify(
      referrer,
      "account",
      "초대한 회원의 첫 협찬이 성사됐어요",
      [
        `초대 링크로 가입한 ${joined.name}의 첫 협찬이 성사됐어요.`,
        days ? `고마운 마음으로 캠퍼스 파트너스 ${days}일을 더해 드렸어요.` : "초대해 주셔서 고마워요.",
      ],
      "/me",
    )
  }
}
