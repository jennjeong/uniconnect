import type { Request } from "express"

import { applicationFor } from "./applications.js"
import { HttpError } from "./errors.js"
import type { Account, Database } from "../types.js"

// One account run by several people (routes/team.ts): its owner, who signed
// up, and co-admins, each with their own email and password. Co-admins do
// most things; leaving, moving the login email, two-step login and the team
// itself stay the owner's.

// How many co-admins and open invitations one account has at most.
export const teamLimit = 5

// The account and co-admin an email logs in as, when it is a co-admin's.
export function memberByEmail(database: Database, email: string) {
  for (const account of database.accounts) {
    const member = account.members?.find((item) => item.email === email)
    if (member) return { account, member }
  }
  return undefined
}

// Whether an email already logs in somewhere: an account's or a co-admin's.
export const emailTaken = (database: Database, email: string) =>
  database.accounts.some((account) => account.email === email) ||
  Boolean(memberByEmail(database, email)) ||
  Boolean(applicationFor(database, email))

// The co-admin logged in, if it is one.
export const memberOf = (account: Account, memberId: string | undefined) =>
  memberId ? account.members?.find((item) => item.id === memberId) : undefined

// The account, when its owner is the one asking.
export function requireOwner(req: Request, account: Account) {
  if (req.memberId) throw new HttpError(403, "계정 대표만 할 수 있어요.")
  return account
}
