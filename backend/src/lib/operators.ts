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

// 콘솔이 운영자 화면에 붙이는 준비 상태: 켜져 있는 운영자 수, 그중 2단계 로그인을 켠 수,
// 공유 토큰(ADMIN_TOKEN)이 설정돼 있고 아직 받는지. 2단계 로그인을 켠 운영자가 생기면 토큰이
// 닫힌다(tokenClosed).
export function operatorReadiness(database: Database, tokenSet: boolean) {
  const enabled = (database.operators ?? []).filter((operator) => !operator.disabledAt)
  return {
    operators: enabled.length,
    twoFactorOn: enabled.filter((operator) => operator.twoFactor).length,
    tokenSet,
    tokenOpen: tokenSet && !tokenClosed(database),
  }
}
