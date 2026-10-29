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
    }
  }
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

// How stale a session's last use may get before it is written again, so the
// device list is right to the hour without a save on every request.
const lastUseEveryMs = 60 * 60 * 1000

// Attaches the logged-in account (if any) from the "Authorization: Bearer"
// header, and notes the session's use for the device list.
export async function readSession(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
  if (token) {
    const database = getDatabase()
    const tokenHash = hashToken(token)
    const session = database.sessions.find(
      (entry) => entry.tokenHash === tokenHash && entry.expiresAt > Date.now(),
    )
    // A suspended account is as good as logged out.
    const account = session && database.accounts.find((item) => item.id === session.accountId && !item.suspendedAt)
    if (session && account) {
      req.sessionToken = token
      req.account = account
      if (Date.now() - (session.lastUsedAt ?? 0) > lastUseEveryMs) {
        session.lastUsedAt = Date.now()
        // Only a note: a failed save doesn't fail the request.
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
