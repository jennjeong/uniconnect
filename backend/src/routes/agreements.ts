import { randomUUID } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { Router, type Request } from "express"

import {
  acceptedProposal,
  acceptedProposalsOf,
  type AcceptedProposal,
  agreementFor,
  agreementView,
  defaultItems,
  sideIn,
  uploadsFolder,
} from "../lib/agreements.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { AgreementItem, Database } from "../types.js"

export const agreementsRouter = Router()

// How much one agreement holds.
export const agreementLimits = { items: 12, links: 5, photos: 3 }

// A photo the browser resized (lib/image.ts), small enough for the request
// size limit.
const photoPattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/
const photoMaxLength = 280_000
const photoName = /^[\w-]+\.(png|jpg|webp)$/

// The file really is the kind it says, by its first bytes.
function looksLike(kind: string, bytes: Buffer) {
  if (kind === "png") return bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  if (kind === "jpeg") return bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  return bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP"
}

// Links as proof: http or https addresses only.
function parseLinks(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError(400, "링크 목록을 다시 확인해 주세요.")
  const links = value.map(text).filter(Boolean)
  if (links.length > agreementLimits.links) throw new HttpError(400, "링크는 5개까지 붙일 수 있어요.")
  return links.map((link) => {
    try {
      const url = new URL(link)
      if ((url.protocol === "http:" || url.protocol === "https:") && link.length <= 300) return url.href
    } catch {
      // Not an address; answered below.
    }
    throw new HttpError(400, "링크는 http:// 또는 https://로 시작하는 주소로 적어 주세요.")
  })
}

// The accepted proposal behind the address, for one of its two sides only.
function opened(req: Request) {
  const account = requireAccount(req)
  const database = getDatabase()
  const proposal = acceptedProposal(database, String(req.params.id))
  const side = proposal && sideIn(proposal, account)
  if (!proposal || !side) throw new HttpError(404, "협찬 약속서를 찾을 수 없어요.")
  return { account, database, proposal, side }
}

// One of the items of an agreement already opened, which only its own side
// marks done or proves.
function ownItem(database: Database, proposal: AcceptedProposal, itemId: unknown, side: AgreementItem["side"]) {
  const agreement = database.agreements.find((entry) => entry.id === proposal.id)
  const item = agreement?.items.find((entry) => entry.id === String(itemId))
  if (!agreement || !item) throw new HttpError(404, "약속한 일을 찾을 수 없어요.")
  if (item.side !== side) throw new HttpError(403, "상대가 할 일은 상대만 표시할 수 있어요.")
  return { agreement, item }
}

// The account's accepted proposals with how far each agreement is: its
// confirmations, the items done and the proof so far.
agreementsRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const agreements = acceptedProposalsOf(database, account).map((proposal) => {
    const side = sideIn(proposal, account)!
    const stored = database.agreements.find((agreement) => agreement.id === proposal.id)
    const items = stored?.items ?? defaultItems(proposal)
    return {
      id: proposal.id,
      side,
      partner: side === "group" ? proposal.brand.name : proposal.group.name,
      eventName: proposal.eventName,
      eventDate: proposal.eventDate,
      confirmed: stored?.confirmed ?? {},
      done: items.filter((item) => item.doneAt).length,
      total: items.length,
      proof: items.reduce((sum, item) => sum + item.links.length + item.photos.length, 0),
    }
  })
  res.json({ agreements })
})

agreementsRouter.get("/:id", async (req, res) => {
  const { database, proposal, side } = opened(req)
  const { agreement, created } = agreementFor(database, proposal)
  if (created) await saveDatabase()
  res.json({ agreement: agreementView(agreement, proposal, side) })
})

// Either side writes what each will do. An item kept keeps its proof; a
// change of any kind asks both sides to confirm again.
agreementsRouter.put("/:id/items", async (req, res) => {
  const { account, database, proposal, side } = opened(req)
  const input = req.body?.items
  if (!Array.isArray(input) || input.length === 0 || input.length > agreementLimits.items) {
    throw new HttpError(400, "약속할 일을 1개부터 12개까지 적어 주세요.")
  }
  const written = input.map((raw) => {
    const itemSide = raw?.side
    const label = text(raw?.label)
    if (itemSide !== "group" && itemSide !== "brand") throw new HttpError(400, "누가 할 일인지 골라 주세요.")
    if (!label) throw new HttpError(400, "할 일을 적어 주세요.")
    if (label.length > 80) throw new HttpError(400, "할 일은 80자 이하로 적어 주세요.")
    return { id: String(raw?.id ?? ""), side: itemSide as AgreementItem["side"], label }
  })
  const { agreement } = agreementFor(database, proposal)
  const items = written.map(({ id, side: itemSide, label }): AgreementItem => {
    const kept = agreement.items.find((item) => item.id === id)
    return kept ? { ...kept, side: itemSide, label } : { id: randomUUID(), side: itemSide, label, links: [], photos: [] }
  })
  const terms = (list: AgreementItem[]) => JSON.stringify(list.map(({ id, side: who, label }) => [id, who, label]))
  const removed = agreement.items.filter((item) => !items.some((next) => next.id === item.id))
  const changed = terms(items) !== terms(agreement.items)
  agreement.items = items
  if (changed) {
    agreement.confirmed = {}
    agreement.updatedAt = new Date().toISOString()
  }
  await saveDatabase()
  await Promise.all(
    removed.flatMap((item) => item.photos.map((photo) => rm(path.join(uploadsFolder(agreement.id), photo), { force: true }))),
  )
  if (changed) {
    void notify(
      side === "group" ? proposal.brand.account : proposal.group.account,
      "협찬 약속서가 바뀌었어요",
      [`${account.name}에서 '${proposal.eventName}' 협찬 약속서를 고쳤어요. 바뀐 내용을 보고 다시 확인해 주세요.`],
      `/agreements/${encodeURIComponent(agreement.id)}`,
    )
  }
  res.json({ agreement: agreementView(agreement, proposal, side) })
})

// A side confirms the items as they stand; the other side hears about it.
agreementsRouter.post("/:id/confirm", async (req, res) => {
  const { account, database, proposal, side } = opened(req)
  const { agreement } = agreementFor(database, proposal)
  const now = new Date().toISOString()
  agreement.confirmed[side] = now
  agreement.updatedAt = now
  await saveDatabase()
  const both = Boolean(agreement.confirmed.group && agreement.confirmed.brand)
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    both ? "협찬 약속서를 양쪽 모두 확인했어요" : "협찬 약속서를 확인해 주세요",
    [`${account.name}에서 '${proposal.eventName}' 협찬 약속서를 확인했어요.`],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.json({ agreement: agreementView(agreement, proposal, side) })
})

// The side an item belongs to marks it done (or not yet) and keeps its links.
agreementsRouter.patch("/:id/items/:itemId", async (req, res) => {
  const { database, proposal, side } = opened(req)
  const { agreement, item } = ownItem(database, proposal, req.params.itemId, side)
  const links = req.body?.links === undefined ? undefined : parseLinks(req.body.links)
  if (links) item.links = links
  if (req.body?.done === true) item.doneAt ??= new Date().toISOString()
  if (req.body?.done === false) delete item.doneAt
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  res.json({ agreement: agreementView(agreement, proposal, side) })
})

// A photo as proof, kept on disk; three per item.
agreementsRouter.post("/:id/items/:itemId/photos", async (req, res) => {
  const { database, proposal, side } = opened(req)
  const { agreement, item } = ownItem(database, proposal, req.params.itemId, side)
  if (item.photos.length >= agreementLimits.photos) throw new HttpError(409, "사진은 할 일마다 3장까지 올릴 수 있어요.")
  const image = req.body?.image
  const match = typeof image === "string" && image.length <= photoMaxLength ? photoPattern.exec(image) : null
  const bytes = match ? Buffer.from(match[2], "base64") : undefined
  if (!match || !bytes || !looksLike(match[1], bytes)) throw new HttpError(400, "사진은 PNG, JPG, WebP로 올려 주세요.")
  const photo = `${randomUUID()}.${match[1] === "jpeg" ? "jpg" : match[1]}`
  const folder = uploadsFolder(proposal.id)
  const file = path.join(folder, photo)
  await mkdir(folder, { recursive: true })
  await writeFile(file, bytes)
  item.photos.push(photo)
  agreement.updatedAt = new Date().toISOString()
  try {
    await saveDatabase()
  } catch (error) {
    // The data went back to before the photo; so does the disk.
    await rm(file, { force: true })
    throw error
  }
  res.status(201).json({ agreement: agreementView(agreement, proposal, side) })
})

agreementsRouter.delete("/:id/items/:itemId/photos/:photo", async (req, res) => {
  const { database, proposal, side } = opened(req)
  const { agreement, item } = ownItem(database, proposal, req.params.itemId, side)
  const photo = String(req.params.photo)
  if (!item.photos.includes(photo)) throw new HttpError(404, "사진을 찾을 수 없어요.")
  item.photos = item.photos.filter((entry) => entry !== photo)
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  await rm(path.join(uploadsFolder(proposal.id), photo), { force: true })
  res.json({ agreement: agreementView(agreement, proposal, side) })
})

// A photo, for the two sides only; the page fetches it with the login token.
agreementsRouter.get("/:id/photos/:photo", async (req, res) => {
  const { database, proposal } = opened(req)
  const agreement = database.agreements.find((entry) => entry.id === proposal.id)
  const photo = String(req.params.photo)
  if (!photoName.test(photo) || !agreement?.items.some((item) => item.photos.includes(photo))) {
    throw new HttpError(404, "사진을 찾을 수 없어요.")
  }
  const bytes = await readFile(path.join(uploadsFolder(proposal.id), photo)).catch(() => undefined)
  if (!bytes) throw new HttpError(404, "사진을 찾을 수 없어요.")
  res.type(photo.endsWith(".png") ? "image/png" : photo.endsWith(".webp") ? "image/webp" : "image/jpeg")
  res.set("Cache-Control", "private, max-age=3600")
  res.send(bytes)
})
