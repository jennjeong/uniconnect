import type { Request } from "express"

import { applicationFor } from "./applications.js"
import { HttpError } from "./errors.js"
import type { Account, Database } from "../types.js"

// 여러 사람이 운영하는 계정 하나(routes/team.ts): 가입한 소유자와 공동
// 관리자가 각자의 이메일과 비밀번호를 가진다. 공동 관리자는 대부분의 일을
// 하지만 탈퇴, 로그인 이메일 이전, 2단계 로그인, 팀 관리는 소유자만 한다.

// 계정 하나에 둘 수 있는 공동 관리자와 열린 초대의 최대 수.
export const teamLimit = 5

// 공동 관리자의 이메일이면 그 이메일이 로그인하는 계정과 공동 관리자.
export function memberByEmail(database: Database, email: string) {
  for (const account of database.accounts) {
    const member = account.members?.find((item) => item.email === email)
    if (member) return { account, member }
  }
  return undefined
}

// 이메일이 이미 어딘가에 로그인하는지: 계정의 것이거나 공동 관리자의 것.
export const emailTaken = (database: Database, email: string) =>
  database.accounts.some((account) => account.email === email) ||
  Boolean(memberByEmail(database, email)) ||
  Boolean(applicationFor(database, email))

// 로그인한 공동 관리자. 공동 관리자일 때만이다.
export const memberOf = (account: Account, memberId: string | undefined) =>
  memberId ? account.members?.find((item) => item.id === memberId) : undefined

// 요청한 사람이 소유자면 그 계정.
export function requireOwner(req: Request, account: Account) {
  if (req.memberId) throw new HttpError(403, "계정 대표만 할 수 있어요.")
  return account
}
