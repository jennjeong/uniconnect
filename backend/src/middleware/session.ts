import { createHash } from "node:crypto"
import type { NextFunction, Request, Response } from "express"

import { HttpError } from "../lib/errors.js"
import { getDatabase, refreshDatabase, saveDatabase } from "../store.js"
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
    const tokenHash = hashToken(token)
    const live = () => getDatabase().sessions.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now())
    // 방금 다른 복사본에서 로그인했으면 그 세션이 아직 여기에 없다. 없는 세션으로
    // 답하면 앱이 로그아웃시키므로 먼저 저장된 데이터를 살핀다.
    if (!live()) await refreshDatabase({ force: true })
    const database = getDatabase()
    const session = live()
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
        // 기록일 뿐이므로 저장에 실패해도 요청은 실패시키지 않는다. 다만 실패하면 데이터가
        // 새 객체로 되돌아가니, 라우트가 옛 계정을 고치고 잃어버리지 않게 다시 찾는다.
        await saveDatabase().catch(() => {
          const fresh = getDatabase().accounts.find((item) => item.id === account.id && !item.suspendedAt)
          if (fresh) req.account = fresh
          else delete req.account
        })
      }
    }
  }
  next()
}

export function requireAccount(req: Request) {
  if (!req.account) throw new HttpError(401, "로그인이 필요해요.")
  return req.account
}
