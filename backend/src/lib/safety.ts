import type { Database } from "../types.js"

// Whether either of two accounts blocked the other (routes/reports.ts).
export const blockedBetween = (database: Database, a: string, b: string) =>
  (database.blocks[a] ?? []).includes(b) || (database.blocks[b] ?? []).includes(a)
