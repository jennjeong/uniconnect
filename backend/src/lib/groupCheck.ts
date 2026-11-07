import type { Account } from "../types.js"

// 운영자가 서류로 확인한 학생단체다. 대표자의 재학은 임기와 함께 끝나므로 표시에도
// 기한이 있다. 서류는 결정이 나면 지우고(lib/applications.ts) 확인한 시각만 남긴다.
const dayMs = 24 * 60 * 60 * 1000
export const groupCheckDays = 365
// 기한이 이만큼 남으면 다시 신청할 수 있다.
export const groupCheckRenewDays = 30

// 서류 둘을 합친 크기. 본문이 Vercel의 한도(4.5MB)를 넘지 않게 한다.
export const groupCheckMaxBytes = 3 * 1024 * 1024

export const grantGroupCheck = (now = new Date()) => ({
  verifiedAt: now.toISOString(),
  until: new Date(now.getTime() + groupCheckDays * dayMs).toISOString(),
})

export const groupVerifiedNow = (account: Account, now = new Date()) =>
  Boolean(account.groupVerified && Date.parse(account.groupVerified.until) > now.getTime())

export const groupCheckRenewable = (account: Account, now = new Date()) =>
  !groupVerifiedNow(account, now) ||
  Date.parse(account.groupVerified!.until) - now.getTime() <= groupCheckRenewDays * dayMs
