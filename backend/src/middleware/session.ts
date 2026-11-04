import { createHash } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

import { HttpError } from "../lib/errors.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account } from "../types.js"

declare global {
  namespace Express {
    interface Request {
      account?: Account
      sessionToken?: string
      // 계정의 공동 관리자가 로그인한 경우에 설정한다.
      memberId?: string
    }
  }
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

// 세션의 마지막 사용 시각이 얼마나 낡아도 되는지를 정한다. 요청마다 저장하지
// 않고도 기기 목록이 시간 단위로 맞도록 하기 위해서다.
const lastUseEveryMs = 60 * 60 * 1000

// "Authorization: Bearer" 헤더로 로그인한 계정이 있으면 붙이고, 기기 목록을
// 위해 세션의 사용을 기록한다.
export async function readSession(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
  if (token) {
    const database = getDatabase()
    const tokenHash = hashToken(token)
    const session = database.sessions.find(
      (entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now(),
    )
    // 정지된 계정은 로그아웃한 것과 같고, 주인이 팀에서 뺀 공동 관리자도
    // 마찬가지다.
    const account = session && database.accounts.find((item) => item.id === session.accountId && !item.suspendedAt)
    const member = session?.memberId ? account?.members?.find((item) => item.id === session.memberId) : undefined
    if (session && account && (!session.memberId || member)) {
      req.sessionToken = token
      req.account = account
      if (member) req.memberId = member.id
      if (Date.now() - (session.lastUsedAt ?? 0) > lastUseEveryMs) {
        session.lastUsedAt = Date.now()
        // 기록일 뿐이므로 저장에 실패해도 요청은 실패시키지 않는다.
        await saveDatabase().catch(() => undefined)
      }
    }
  }
  next()
}

export function requireAccount(req: Request) {
  if (!req.account) throw new HttpError(401, "로그인이 필요해요.")
  return req.account
}
