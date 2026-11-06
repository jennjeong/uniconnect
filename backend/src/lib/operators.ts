import { hashToken } from "../middleware/session.js"
import type { Database, Operator } from "../types.js"

// 세션 토큰이 가리키는 켜져 있는 운영자다.
export function operatorFor(database: Database, token: string): Operator | undefined {
  const tokenHash = hashToken(token)
  const session = database.operatorSessions?.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now())
  const operator = session && database.operators?.find((entry) => entry.id === session.operatorId)
  return operator && !operator.disabledAt ? operator : undefined
}

export const activeOperators = (database: Database) =>
  (database.operators ?? []).filter((operator) => operator.twoFactor && !operator.disabledAt)

// 2단계 로그인까지 마친 운영자가 있으면 공유 토큰은 더 받지 않는다.
export const tokenClosed = (database: Database) => activeOperators(database).length > 0
