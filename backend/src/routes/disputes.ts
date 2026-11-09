import { randomUUID } from "node:crypto"
import { Router, type Request } from "express"

import { acceptedProposal, agreementFor, sideIn } from "../lib/agreements.js"
import { logAdmin } from "../lib/adminTools.js"
import { parseDocument } from "../lib/applications.js"
import {
  addDisputeEvent,
  agreementSnapshot,
  disputeFolder,
  disputeLimits,
  disputeOpen,
  disputeOutcomes,
  disputeReasons,
  disputesOf,
  disputeView,
  evidenceBytesOf,
} from "../lib/disputes.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { photos, photoType } from "../lib/photos.js"
import { createRateLimit } from "../lib/rateLimit.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { ChatSide, Database, Dispute, DisputeOutcome, DisputeReason } from "../types.js"
import { requireAdmin } from "./admin.js"

// 협찬 분쟁의 접수와 기록이다(lib/disputes.ts). 당사자와 운영자만 본다.
export const disputesRouter = Router()
export const adminDisputesRouter = Router()

const opensPerDay = createRateLimit({
  label: "협찬 분쟁 접수",
  limit: 5,
  windowMs: 24 * 60 * 60 * 1000,
  message: "분쟁을 너무 많이 접수했어요. 내일 다시 시도해 주세요.",
})

const other = (side: ChatSide): ChatSide => (side === "group" ? "brand" : "group")
const path = (dispute: Dispute) => `/agreements/${encodeURIComponent(dispute.agreementId)}`
const accountOf = (database: Database, dispute: Dispute, side: ChatSide) =>
  database.accounts.find((account) => account.id === dispute.parties[side])

// 다른 사람의 분쟁은 있는지도 알려 주지 않는다.
function own(req: Request) {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 분쟁을 접수할 수 없어요.")
  const dispute = disputesOf(database).find((item) => item.id === req.params.id)
  const side = dispute && (Object.keys(dispute.parties) as ChatSide[]).find((key) => dispute.parties[key] === account.id)
  if (!dispute || !side) throw new HttpError(404, "분쟁을 찾을 수 없어요.")
  return { account, database, dispute, side }
}

function stillOpen(dispute: Dispute) {
  if (!disputeOpen(dispute)) throw new HttpError(409, "이미 끝난 분쟁이에요.")
}

const statementOf = (input: unknown, missing: string) => {
  const said = text(input)
  if (!said) throw new HttpError(400, missing)
  if (said.length > disputeLimits.detail) throw new HttpError(400, "1,000자 이하로 적어 주세요.")
  return said
}

function tellBoth(database: Database, dispute: Dispute, subject: string, line: string) {
  for (const side of ["group", "brand"] as const) {
    void notify(accountOf(database, dispute, side), "account", subject, [`'${dispute.eventName}' ${line}`], path(dispute))
  }
}

disputesRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const agreementId = req.query.agreementId === undefined ? undefined : String(req.query.agreementId)
  const disputes = disputesOf(getDatabase()).flatMap((dispute) => {
    const side = (Object.keys(dispute.parties) as ChatSide[]).find((key) => dispute.parties[key] === account.id)
    return side && (!agreementId || dispute.agreementId === agreementId) ? [disputeView(dispute, side)] : []
  })
  res.json({ disputes: disputes.reverse() })
})

disputesRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 분쟁을 접수할 수 없어요.")
  const proposal = acceptedProposal(database, text(req.body?.agreementId))
  const side = proposal && sideIn(proposal, account)
  if (!proposal || !side) throw new HttpError(404, "임시 전자 계약서를 찾을 수 없어요.")
  const counterpart = proposal[other(side)].account
  if (!counterpart || isDemoAccount(database, counterpart)) throw new HttpError(409, "계정이 없는 상대라 분쟁을 접수할 수 없어요.")
  const reason = text(req.body?.reason) as DisputeReason
  if (!disputeReasons.includes(reason)) throw new HttpError(400, "어떤 일인지 골라 주세요.")
  const detail = statementOf(req.body?.detail, "어떤 일이 있었는지 적어 주세요.")
  const waiting = () => {
    if (disputesOf(database).some((item) => item.agreementId === proposal.id && disputeOpen(item))) {
      throw new HttpError(409, "이 협찬에는 진행 중인 분쟁이 있어요.")
    }
  }
  waiting()
  await opensPerDay.take(account.id)
  waiting()
  const { agreement } = agreementFor(database, proposal)
  const now = new Date().toISOString()
  const dispute: Dispute = {
    id: randomUUID(),
    agreementId: proposal.id,
    eventName: proposal.eventName,
    groupName: proposal.group.name,
    brandName: proposal.brand.name,
    parties: { [side]: account.id, [other(side)]: counterpart.id } as Dispute["parties"],
    openedBy: side,
    reason,
    detail,
    status: "open",
    snapshot: agreementSnapshot(agreement, proposal.canceled),
    evidence: [],
    events: [{ at: now, by: side, kind: "opened" }],
    createdAt: now,
    updatedAt: now,
  }
  disputesOf(database).push(dispute)
  await saveDatabase()
  void notify(counterpart, "account", "협찬 분쟁이 접수됐어요", [`${account.name}에서 '${proposal.eventName}' 협찬 분쟁을 접수했어요. 내용을 보고 입장을 남겨 주세요.`], path(dispute))
  res.status(201).json({ dispute: disputeView(dispute, side) })
})

disputesRouter.get("/:id", (req, res) => {
  const { dispute, side } = own(req)
  res.json({ dispute: disputeView(dispute, side) })
})

// 양쪽이 말을 더한다. 남긴 말은 고치거나 지울 수 없다.
disputesRouter.post("/:id/statements", async (req, res) => {
  const { account, database, dispute, side } = own(req)
  stillOpen(dispute)
  const said = statementOf(req.body?.text, "남길 말을 적어 주세요.")
  const count = dispute.events.filter((event) => event.kind === "statement" && event.by === side).length
  if (count >= disputeLimits.statements) throw new HttpError(409, "남길 수 있는 말을 모두 썼어요. 운영자의 결론을 기다려 주세요.")
  addDisputeEvent(dispute, { by: side, kind: "statement", text: said })
  await saveDatabase()
  void notify(accountOf(database, dispute, other(side)), "account", "협찬 분쟁에 새 내용이 있어요", [`${account.name}에서 '${dispute.eventName}' 분쟁에 말을 남겼어요.`], path(dispute))
  res.status(201).json({ dispute: disputeView(dispute, side) })
})

// 증빙은 사진이나 2MB 이하 PDF이고, 양쪽 당사자와 운영자가 본다.
disputesRouter.post("/:id/evidence", async (req, res) => {
  const { account, dispute, side } = own(req)
  stillOpen(dispute)
  const full = (item: Dispute) => item.evidence.filter((entry) => entry.side === side).length >= disputeLimits.evidencePerSide
  if (full(dispute)) throw new HttpError(409, "증빙은 한쪽마다 5개까지 올릴 수 있어요.")
  const document = parseDocument(req.body, "증빙을 사진이나 PDF로 올려 주세요.")
  const noRoom = () => evidenceBytesOf(getDatabase(), account.id) + document.bytes.length > disputeLimits.evidenceBytes
  if (noRoom()) throw new HttpError(409, "분쟁 증빙을 더 올릴 공간이 없어요(계정마다 모두 합쳐 20MB).")
  const folder = disputeFolder(dispute.id)
  const store = photos()
  await store.put(folder, document.file, document.bytes)
  try {
    // 다시 찾는다. 파일이 들어오는 동안 데이터를 새로 읽었을 수 있다.
    const database = getDatabase()
    const fresh = disputesOf(database).find((item) => item.id === dispute.id)
    if (!fresh) throw new HttpError(404, "분쟁을 찾을 수 없어요.")
    stillOpen(fresh)
    if (full(fresh)) throw new HttpError(409, "증빙은 한쪽마다 5개까지 올릴 수 있어요.")
    if (noRoom()) throw new HttpError(409, "분쟁 증빙을 더 올릴 공간이 없어요(계정마다 모두 합쳐 20MB).")
    const id = randomUUID()
    const now = new Date()
    fresh.evidence.push({ id, side, file: document.file, name: document.name, size: document.bytes.length, addedAt: now.toISOString() })
    addDisputeEvent(fresh, { by: side, kind: "evidence", evidenceId: id }, now)
    await saveDatabase()
    void notify(accountOf(database, fresh, other(side)), "account", "협찬 분쟁에 새 내용이 있어요", [`${account.name}에서 '${fresh.eventName}' 분쟁에 증빙을 올렸어요.`], path(fresh))
    res.status(201).json({ dispute: disputeView(fresh, side) })
  } catch (error) {
    await store.remove(folder, [document.file])
    throw error
  }
})

async function sendEvidence(res: Parameters<Parameters<typeof disputesRouter.get>[1]>[1], dispute: Dispute, evidenceId: string) {
  const item = dispute.evidence.find((entry) => entry.id === evidenceId)
  const bytes = item && (await photos().get(disputeFolder(dispute.id), item.file))
  if (!item || !bytes) throw new HttpError(404, "증빙을 찾을 수 없어요.")
  res.type(photoType(item.file)).set("Cache-Control", "no-store").send(bytes)
}

disputesRouter.get("/:id/evidence/:evidenceId", async (req, res) => {
  const { dispute } = own(req)
  await sendEvidence(res, dispute, String(req.params.evidenceId))
})

// 접수한 쪽이 거둔다. 기록은 남는다.
disputesRouter.post("/:id/withdraw", async (req, res) => {
  const { account, database, dispute, side } = own(req)
  stillOpen(dispute)
  if (dispute.openedBy !== side) throw new HttpError(403, "접수한 쪽만 거둘 수 있어요.")
  const now = new Date()
  dispute.status = "closed"
  dispute.decision = { outcome: "withdrawn", at: now.toISOString() }
  addDisputeEvent(dispute, { by: side, kind: "withdrawn" }, now)
  await saveDatabase()
  void notify(accountOf(database, dispute, other(side)), "account", "협찬 분쟁이 거둬졌어요", [`${account.name}에서 '${dispute.eventName}' 분쟁을 거뒀어요.`], path(dispute))
  res.json({ dispute: disputeView(dispute, side) })
})

// 운영자 콘솔: 진행 중인 것을 먼저, 오래된 순서로 보여 준다.
const adminDispute = (database: Database, id: unknown) => {
  const dispute = disputesOf(database).find((item) => item.id === id)
  if (!dispute) throw new HttpError(404, "분쟁을 찾을 수 없어요.")
  return dispute
}
const adminView = ({ evidence, ...dispute }: Dispute) => ({
  ...dispute,
  evidence: evidence.map(({ file: _file, ...item }) => item),
})

adminDisputesRouter.get("/", async (req, res) => {
  await requireAdmin(req)
  const rows = [...disputesOf(getDatabase())].sort(
    (a, b) => Number(disputeOpen(b)) - Number(disputeOpen(a)) || a.createdAt.localeCompare(b.createdAt),
  )
  res.json({ disputes: rows.map(adminView) })
})

adminDisputesRouter.get("/:id/evidence/:evidenceId", async (req, res) => {
  await requireAdmin(req)
  await sendEvidence(res, adminDispute(getDatabase(), req.params.id), String(req.params.evidenceId))
})

// 운영자가 보기 시작했다고 양쪽에 알린다.
adminDisputesRouter.post("/:id/review", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const dispute = adminDispute(database, req.params.id)
  if (dispute.status !== "open") throw new HttpError(409, "이미 확인 중이거나 끝난 분쟁이에요.")
  dispute.status = "reviewing"
  addDisputeEvent(dispute, { by: "admin", kind: "reviewing" })
  logAdmin(database, "dispute-reviewing", { kind: "dispute", id: dispute.id })
  await saveDatabase()
  tellBoth(database, dispute, "운영자가 협찬 분쟁을 확인하고 있어요", "분쟁을 운영자가 확인하기 시작했어요.")
  res.json({ dispute: adminView(dispute) })
})

// 운영자끼리 보는 메모다. 당사자에게는 보이지 않는다.
adminDisputesRouter.post("/:id/notes", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const dispute = adminDispute(database, req.params.id)
  const note = statementOf(req.body?.text, "메모를 적어 주세요.")
  const notes = (dispute.notes ??= [])
  if (notes.length >= disputeLimits.notes) throw new HttpError(409, "메모를 더 남길 수 없어요.")
  notes.push({ at: new Date().toISOString(), text: note })
  logAdmin(database, "dispute-note", { kind: "dispute", id: dispute.id })
  await saveDatabase()
  res.status(201).json({ dispute: adminView(dispute) })
})

// 결론을 기록한다. 고칠 수 없고, 계정이나 결제를 자동으로 바꾸지 않는다.
adminDisputesRouter.post("/:id/decision", async (req, res) => {
  await requireAdmin(req)
  const database = getDatabase()
  const dispute = adminDispute(database, req.params.id)
  stillOpen(dispute)
  const outcome = text(req.body?.outcome) as DisputeOutcome
  if (!(disputeOutcomes as readonly string[]).includes(outcome)) throw new HttpError(400, "결론을 골라 주세요.")
  const note = statementOf(req.body?.note, "결론의 이유를 적어 주세요.")
  const now = new Date()
  dispute.status = "closed"
  dispute.decision = { outcome, note, at: now.toISOString() }
  addDisputeEvent(dispute, { by: "admin", kind: "decided", text: note }, now)
  logAdmin(database, "dispute-decided", { kind: "dispute", id: dispute.id }, outcome)
  await saveDatabase()
  tellBoth(database, dispute, "협찬 분쟁의 결론이 기록됐어요", "분쟁에 운영자가 결론을 기록했어요. 계약서에서 확인해 주세요.")
  res.json({ dispute: adminView(dispute) })
})
