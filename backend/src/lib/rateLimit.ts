import { createHash } from "node:crypto"
import type { Request } from "express"

import { HttpError } from "./errors.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"
import type { Account, Database } from "../types.js"

// Counts requests per key (an IP, or an IP and an email) in fixed windows.
// With a database (DATABASE_URL) the counts live in its uniconnect_limits
// table, so every copy of the API on Vercel shares them; a key is kept
// there only as a hash, as it holds addresses and emails. Without one, or
// when it doesn't answer within a moment, they are counted in this copy's
// memory, as before.
type Bucket = { count: number; resetAt: number }

const limiters = new Set<Map<string, Bucket>>()

// Every limit by its name in the table, for the operators' status.
const registry = new Map<string, { limit: number; windowMs: number; message: string; buckets: Map<string, Bucket> }>()

// How long a count may wait for the database before memory counts it.
export const sharedLimits = { waitMs: 1500 }

// Rows of windows that ended are swept now and then, by one hit in this many.
const sweepEvery = 200

function withinWait<T>(work: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("rate limit store timed out")), sharedLimits.waitMs)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

let warned = false
function fallBack(error: unknown) {
  if (warned) return
  warned = true
  console.warn("[rateLimit] counting in memory: the database didn't answer", error)
}

export function createRateLimit({
  limit,
  windowMs,
  message,
}: {
  limit: number
  windowMs: number
  message: string
}) {
  const buckets = new Map<string, Bucket>()
  limiters.add(buckets)
  // The limit's name in the table: what tells it from the others.
  const name = createHash("sha256").update(`${limit} ${windowMs} ${message}`).digest("hex").slice(0, 16)
  registry.set(name, { limit, windowMs, message, buckets })
  const keyHash = (key: string) => createHash("sha256").update(key).digest("hex")

  const live = (key: string) => {
    const bucket = buckets.get(key)
    if (bucket && bucket.resetAt > Date.now()) return bucket
    buckets.delete(key)
    return undefined
  }

  const memory = {
    count: (key: string) => live(key)?.count ?? 0,
    hit: (key: string) => {
      if (buckets.size > 10000) {
        for (const [stale, bucket] of buckets) if (bucket.resetAt <= Date.now()) buckets.delete(stale)
      }
      const bucket = live(key) ?? { count: 0, resetAt: Date.now() + windowMs }
      bucket.count += 1
      buckets.set(key, bucket)
      return bucket.count
    },
    reset: (key: string) => void buckets.delete(key),
  }

  // The count in the shared table, or in memory without one.
  const shared = async <T>(run: (sql: Sql) => Promise<T>, local: () => T) => {
    const sql = databaseSql()
    if (!sql) return local()
    try {
      return await withinWait((async () => {
        await ensureTables(sql)
        return run(sql)
      })())
    } catch (error) {
      fallBack(error)
      return local()
    }
  }

  const count = (key: string) =>
    shared(
      async (sql) => {
        const [row] = await sql("select count from uniconnect_limits where name = $1 and key = $2 and reset_at > $3", [
          name,
          keyHash(key),
          Date.now(),
        ])
        return row ? Number(row.count) : 0
      },
      () => memory.count(key),
    )

  // Counts one more in the key's window (a new one once it ended), and
  // answers the count.
  const hit = (key: string) =>
    shared(
      async (sql) => {
        const now = Date.now()
        const [row] = await sql(
          `insert into uniconnect_limits (name, key, count, reset_at) values ($1, $2, 1, $3)
           on conflict (name, key) do update set
             count = case when uniconnect_limits.reset_at <= $4 then 1 else uniconnect_limits.count + 1 end,
             reset_at = case when uniconnect_limits.reset_at <= $4 then excluded.reset_at else uniconnect_limits.reset_at end
           returning count`,
          [name, keyHash(key), now + windowMs, now],
        )
        if (Math.floor(Math.random() * sweepEvery) === 0) await sql("delete from uniconnect_limits where reset_at <= $1", [now])
        return Number(row.count)
      },
      () => memory.hit(key),
    )

  // Throws 429 once the key has used up its window.
  const check = async (key: string) => {
    if ((await count(key)) >= limit) throw new HttpError(429, message)
  }

  return {
    check,
    hit: async (key: string) => {
      await hit(key)
    },
    // For limits on every request: counts this one, and throws 429 when it
    // goes past the limit. One step, so requests sent at once can't all
    // pass a check before any is counted.
    take: async (key: string) => {
      if ((await hit(key)) > limit) throw new HttpError(429, message)
    },
    reset: (key: string) =>
      shared(
        async (sql) => {
          await sql("delete from uniconnect_limits where name = $1 and key = $2", [name, keyHash(key)])
        },
        () => memory.reset(key),
      ),
  }
}

// How many keys each limit is counting now and how many it is turning
// away, never the keys themselves: from the shared table with a database,
// else this copy's memory.
export async function limitStatus() {
  const now = Date.now()
  const sql = databaseSql()
  let rows: { name: string; count: number }[] | undefined
  if (sql) {
    try {
      await ensureTables(sql)
      rows = (await sql("select name, count from uniconnect_limits where reset_at > $1", [now])).map((row) => ({
        name: String(row.name),
        count: Number(row.count),
      }))
    } catch {
      rows = undefined
    }
  }
  return [...registry.entries()].map(([name, entry]) => {
    const counts = rows
      ? rows.filter((row) => row.name === name).map((row) => row.count)
      : [...entry.buckets.values()].filter((bucket) => bucket.resetAt > now).map((bucket) => bucket.count)
    return {
      message: entry.message,
      limit: entry.limit,
      minutes: Math.round(entry.windowMs / 60000),
      counting: counts.length,
      blocked: counts.filter((count) => count >= entry.limit).length,
    }
  })
}

// The caller's address. Behind a proxy it is only right once TRUST_PROXY
// says how far to trust X-Forwarded-For (see config.ts).
export const clientKey = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown"

// What an account sends is counted by the account, from any address. The
// shared demo accounts are counted per address too, so one visitor can't
// use up everyone's.
export function senderKey(req: Request, database: Database, account: Account) {
  const demo = Object.values(database.demoAccountIds).includes(account.id)
  return demo ? `${account.id} ${clientKey(req)}` : account.id
}

// Tests start each case with fresh counts, in memory and in the table.
export async function clearRateLimits() {
  for (const buckets of limiters) buckets.clear()
  const sql = databaseSql()
  if (sql) {
    await ensureTables(sql)
    await sql("delete from uniconnect_limits")
  }
}
