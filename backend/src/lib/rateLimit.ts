import { createHash } from "node:crypto"
import type { Request } from "express"

import { HttpError } from "./errors.js"
import { databaseSql, ensureTables, type Sql } from "./sql.js"
import type { Account, Database } from "../types.js"

// 키(IP, 또는 IP와 이메일)별 요청을 고정 윈도로 센다. 데이터베이스
// (DATABASE_URL)가 있으면 uniconnect_limits 테이블에 세어 Vercel의 모든
// API 복사본이 공유한다. 키에 주소와 이메일이 들어 있으므로 거기에는
// 해시로만 둔다. 데이터베이스가 없거나 잠시 안에 답하지 않으면 예전처럼 이
// 복사본의 메모리에서 센다.
type Bucket = { count: number; resetAt: number }

const limiters = new Set<Map<string, Bucket>>()

// 운영자 상태 화면용으로 이름별로 모은 모든 한도.
const registry = new Map<string, { limit: number; windowMs: number; message: string; buckets: Map<string, Bucket> }>()

// 메모리로 넘어가기 전에 데이터베이스를 기다릴 수 있는 시간.
export const sharedLimits = { waitMs: 1500 }

// 끝난 윈도의 행은 이만큼의 요청 중 한 번꼴로 가끔 쓸어 낸다.
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
  // 테이블에서의 한도 이름. 다른 한도와 구분하는 값이다.
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

  // 공유 테이블의 카운트. 테이블이 없으면 메모리의 카운트.
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

  // 키의 윈도에서 하나 더 센다(끝났으면 새 윈도). 센 값을 답한다.
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

  // 키가 윈도를 다 쓰면 429를 던진다.
  const check = async (key: string) => {
    if ((await count(key)) >= limit) throw new HttpError(429, message)
  }

  return {
    check,
    hit: async (key: string) => {
      await hit(key)
    },
    // 모든 요청에 거는 한도용: 이 요청을 세고 한도를 넘으면 429를 던진다.
    // 한 단계로 처리해, 동시에 온 요청이 하나도 세기 전에 모두 검사를
    // 통과하지 못하게 한다.
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

// 한도마다 지금 세는 키 수와 막은 수. 키 자체는 담지 않는다. 데이터베이스가
// 있으면 공유 테이블에서, 없으면 이 복사본의 메모리에서 센다.
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

// 호출한 쪽 주소. 프록시 뒤에서는 TRUST_PROXY가 X-Forwarded-For를 어디까지
// 믿을지 정해야만 맞는다(config.ts 참고).
export const clientKey = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown"

// 계정이 보내는 요청은 주소와 상관없이 계정별로 센다. 공용 데모 계정은
// 주소별로도 세어서 한 방문자가 모두의 몫을 다 쓰지 못하게 한다.
export function senderKey(req: Request, database: Database, account: Account) {
  const demo = Object.values(database.demoAccountIds).includes(account.id)
  return demo ? `${account.id} ${clientKey(req)}` : account.id
}

// 테스트는 메모리와 테이블 모두 새 카운트로 각 케이스를 시작한다.
export async function clearRateLimits() {
  for (const buckets of limiters) buckets.clear()
  const sql = databaseSql()
  if (sql) {
    await ensureTables(sql)
    await sql("delete from uniconnect_limits")
  }
}
