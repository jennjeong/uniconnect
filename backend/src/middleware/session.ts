import type { NextFunction, Request, Response } from "express"

import { HttpError } from "../lib/errors.js"
import { getDatabase } from "../store.js"
import type { Account } from "../types.js"

declare global {
  namespace Express {
    interface Request {
      account?: Account
      sessionToken?: string
    }
  }
}

// Attaches the logged-in account (if any) from the "Authorization: Bearer" header.
export function readSession(req: Request, _res: Response, next: NextFunction) {
  const header = req.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
  if (token) {
    const database = getDatabase()
    const session = database.sessions.find(
      (entry) => entry.token === token && entry.expiresAt > Date.now(),
    )
    if (session) {
      req.sessionToken = token
      req.account = database.accounts.find((account) => account.id === session.accountId)
    }
  }
  next()
}

export function requireAccount(req: Request) {
  if (!req.account) throw new HttpError(401, "로그인이 필요해요.")
  return req.account
}
