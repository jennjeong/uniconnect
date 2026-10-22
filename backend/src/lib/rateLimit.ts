import type { Request } from "express"

import { HttpError } from "./errors.js"

// Counts requests per key (an IP, or an IP and an email) in fixed windows,
// in memory. That is enough for the single server this prototype runs as;
// several servers would share the counts through something like Redis.
type Bucket = { count: number; resetAt: number }

const limiters = new Set<Map<string, Bucket>>()

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

  const live = (key: string) => {
    const bucket = buckets.get(key)
    if (bucket && bucket.resetAt > Date.now()) return bucket
    buckets.delete(key)
    return undefined
  }

  // Throws 429 once the key has used up its window.
  const check = (key: string) => {
    if ((live(key)?.count ?? 0) >= limit) throw new HttpError(429, message)
  }

  const hit = (key: string) => {
    if (buckets.size > 10000) {
      for (const [stale, bucket] of buckets) if (bucket.resetAt <= Date.now()) buckets.delete(stale)
    }
    const bucket = live(key) ?? { count: 0, resetAt: Date.now() + windowMs }
    bucket.count += 1
    buckets.set(key, bucket)
  }

  return {
    check,
    hit,
    // For limits on every request: check, then count this one.
    take: (key: string) => {
      check(key)
      hit(key)
    },
    reset: (key: string) => {
      buckets.delete(key)
    },
  }
}

// The caller's address. Behind a proxy it is only right once TRUST_PROXY
// says how far to trust X-Forwarded-For (see config.ts).
export const clientKey = (req: Request) => req.ip ?? req.socket.remoteAddress ?? "unknown"

// Tests start each case with fresh counts.
export function clearRateLimits() {
  for (const buckets of limiters) buckets.clear()
}
