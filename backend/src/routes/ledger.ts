import { randomBytes } from "node:crypto"
import { Router } from "express"

import { acceptedProposalsOf, sideIn } from "../lib/agreements.js"
import { findListing } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, Database } from "../types.js"

export const ledgerRouter = Router()

// How long a note on one sponsorship may be.
const maxNote = 200

// The sponsorships a student group received and kept (accepted, not called
// off), latest first: the event, the brand, what it gave, what the agreement
// says it was worth, the group's note and the event's QR check-ins.
function entriesOf(database: Database, account: Account) {
  const notes = account.ledger?.notes ?? {}
  return acceptedProposalsOf(database, account)
    .filter((proposal) => !proposal.canceled && sideIn(proposal, account) === "group")
    .map((proposal) => {
      const value = database.agreements.find((item) => item.id === proposal.id)?.value
      const measurement =
        proposal.eventOwner === "group" && proposal.eventId
          ? database.measurements.find((item) => item.accountId === account.id && item.eventId === proposal.eventId)
          : undefined
      return {
        id: proposal.id,
        eventName: proposal.eventName,
        eventDate: proposal.eventDate,
        brandName: proposal.brand.name,
        gives: proposal.gives,
        ...(value ? { value: value.cash + value.inKind } : {}),
        ...(Object.hasOwn(notes, proposal.id) ? { note: notes[proposal.id] } : {}),
        ...(measurement ? { scans: measurement.metrics.scans } : {}),
      }
    })
}

// The group's own account; the shared demo accounts publish nothing.
function ownGroup(req: Parameters<typeof requireAccount>[0]) {
  const account = requireAccount(req)
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체만 협찬 결산을 공개할 수 있어요.")
  if (isDemoAccount(getDatabase(), account)) throw new HttpError(403, "데모 계정은 협찬 결산을 공개할 수 없어요.")
  return account
}

const ownView = (database: Database, account: Account) => ({
  token: account.ledger?.token ?? null,
  showValues: account.ledger?.showValues ?? false,
  entries: entriesOf(database, account),
})

ledgerRouter.get("/", (req, res) => {
  res.json(ownView(getDatabase(), ownGroup(req)))
})

// Makes the public link, or a new one in place of the old (which stops).
ledgerRouter.post("/link", async (req, res) => {
  const account = ownGroup(req)
  account.ledger = { showValues: false, ...account.ledger, token: randomBytes(18).toString("base64url") }
  await saveDatabase()
  res.json(ownView(getDatabase(), account))
})

// Stops sharing: the link answers 404 from now on.
ledgerRouter.delete("/link", async (req, res) => {
  const account = ownGroup(req)
  if (account.ledger) delete account.ledger.token
  await saveDatabase()
  res.json(ownView(getDatabase(), account))
})

// Whether amounts show, and the notes on the group's own sponsorships.
ledgerRouter.put("/", async (req, res) => {
  const account = ownGroup(req)
  const database = getDatabase()
  const showValues: unknown = req.body?.showValues
  const notes: unknown = req.body?.notes
  if (showValues !== undefined && typeof showValues !== "boolean") throw new HttpError(400, "금액 공개 여부를 다시 확인해 주세요.")
  const ledger = { showValues: false, ...account.ledger }
  if (typeof showValues === "boolean") ledger.showValues = showValues
  if (notes !== undefined) {
    if (!notes || typeof notes !== "object" || Array.isArray(notes)) throw new HttpError(400, "메모를 다시 확인해 주세요.")
    const own = new Set(entriesOf(database, account).map((entry) => entry.id))
    const kept = { ...ledger.notes }
    for (const [id, value] of Object.entries(notes as Record<string, unknown>)) {
      if (!own.has(id)) throw new HttpError(404, "협찬을 찾을 수 없어요.")
      const note = text(value)
      if (note.length > maxNote) throw new HttpError(400, "메모는 200자 이하로 적어 주세요.")
      if (note) kept[id] = note
      else delete kept[id]
    }
    ledger.notes = kept
  }
  account.ledger = ledger
  await saveDatabase()
  res.json(ownView(database, account))
})

// The public page behind the link: the group, its sponsorships (amounts
// only when it chose to show them) and what they add up to. No login.
ledgerRouter.get("/public/:token", (req, res) => {
  const database = getDatabase()
  const token = String(req.params.token)
  const account = /^[\w-]{20,40}$/.test(token)
    ? database.accounts.find((item) => item.ledger?.token === token && !item.suspendedAt)
    : undefined
  if (!account) throw new HttpError(404, "공개된 협찬 결산을 찾을 수 없어요.")
  const showValues = account.ledger?.showValues ?? false
  const entries = entriesOf(database, account).map(({ value, ...entry }) => (showValues && value !== undefined ? { ...entry, value } : entry))
  const listing = findListing(database, account)
  res.json({
    group: { name: listing?.name ?? account.name, school: account.school },
    showValues,
    entries,
    totals: {
      sponsorships: entries.length,
      brands: new Set(entries.map((entry) => entry.brandName)).size,
      ...(showValues ? { value: entries.reduce((sum, entry) => sum + ("value" in entry ? (entry.value ?? 0) : 0), 0) } : {}),
    },
  })
})
