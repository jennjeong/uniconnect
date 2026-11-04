import type { Database } from "../types.js"

// 두 계정 중 어느 쪽이든 상대를 차단했는지(routes/reports.ts).
export const blockedBetween = (database: Database, a: string, b: string) =>
  (database.blocks[a] ?? []).includes(b) || (database.blocks[b] ?? []).includes(a)
