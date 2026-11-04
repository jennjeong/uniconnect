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

// 협찬 하나에 남길 수 있는 메모의 최대 길이다.
const maxNote = 200

// 학생단체가 받아서 유지 중인 협찬(수락했고 취소하지 않은 것)을 최신순으로
// 보여 준다. 행사, 브랜드, 브랜드가 준 것, 계약서가 매긴 가치, 단체의 메모,
// 행사의 QR 체크인을 담는다.
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

// 단체 자신의 계정이다. 공유 데모 계정은 아무것도 공개하지 않는다.
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

// 공개 링크를 만들거나, 기존 링크 대신 새 링크를 만든다(기존 링크는 멈춘다).
ledgerRouter.post("/link", async (req, res) => {
  const account = ownGroup(req)
  account.ledger = { showValues: false, ...account.ledger, token: randomBytes(18).toString("base64url") }
  await saveDatabase()
  res.json(ownView(getDatabase(), account))
})

// 공유를 멈춘다. 이후 링크는 404로 답한다.
ledgerRouter.delete("/link", async (req, res) => {
  const account = ownGroup(req)
  if (account.ledger) delete account.ledger.token
  await saveDatabase()
  res.json(ownView(getDatabase(), account))
})

// 금액을 보여 줄지와 단체 자신의 협찬에 붙은 메모를 정한다.
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

// 링크 뒤의 공개 페이지다. 단체, 그 협찬(금액은 보여 주기로 한 경우에만),
// 합계를 보여 준다. 로그인은 필요 없다.
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
