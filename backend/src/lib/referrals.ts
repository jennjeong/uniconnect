import { randomBytes } from "node:crypto"

import { grantPartners } from "./adminTools.js"
import { notify } from "./notices.js"
import { isDemoAccount } from "./reviews.js"
import type { Account, Database } from "../types.js"

// Days of 캠퍼스 파트너스 a brand gets for each account that signed up
// through its link and went on to a sponsorship. Student groups use the
// service free, so theirs are counted only.
export const referralRewardDays = 30

// Letters that read the same on any screen, without 0/O or 1/I/L.
const letters = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// The account's invitation code, made the first time it's asked for.
export function referralCodeOf(database: Database, account: Account) {
  if (account.referralCode) return account.referralCode
  let code = ""
  do {
    code = [...randomBytes(8)].map((byte) => letters[byte % letters.length]).join("")
  } while (database.accounts.some((item) => item.referralCode === code))
  account.referralCode = code
  return code
}

// The member a code belongs to, never a demo account or a suspended one.
export function referrerOf(database: Database, code: unknown) {
  if (typeof code !== "string" || !/^[A-Z0-9]{8}$/.test(code)) return undefined
  const account = database.accounts.find((item) => item.referralCode === code)
  return account && !isDemoAccount(database, account) && !account.suspendedAt ? account : undefined
}

// After a sponsorship is accepted: each side that signed up through someone's
// link and hadn't yet had a sponsorship rewards that someone once, a brand
// with Partners days. Answers who was rewarded for whom, to tell them.
export function rewardReferrals(database: Database, accounts: (Account | undefined)[], now = new Date()) {
  const rewarded: { referrer: Account; joined: Account; days: number }[] = []
  for (const joined of accounts) {
    if (!joined?.referredBy || joined.referralRewardedAt) continue
    joined.referralRewardedAt = now.toISOString()
    const referrer = database.accounts.find((item) => item.id === joined.referredBy)
    if (!referrer || referrer.suspendedAt) continue
    const days = referrer.role === "브랜드" ? referralRewardDays : 0
    if (days) grantPartners(database, referrer, days, now, "친구 초대 보상")
    rewarded.push({ referrer, joined, days })
  }
  return rewarded
}

// What 내 정보 shows: the code, how many signed up through it, and how many
// of those have had a sponsorship (each one a reward for a brand).
export function referralStats(database: Database, account: Account) {
  const joined = database.accounts.filter((item) => item.referredBy === account.id)
  return {
    code: referralCodeOf(database, account),
    joined: joined.length,
    rewarded: joined.filter((item) => item.referralRewardedAt).length,
    rewardDays: account.role === "브랜드" ? referralRewardDays : 0,
  }
}

// Emails each rewarded inviter, once the reward is saved.
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
