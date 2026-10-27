import { randomUUID } from "node:crypto"
import { Router, type Request } from "express"

import {
  acceptedProposal,
  acceptedProposalsOf,
  type AcceptedProposal,
  agreementFor,
  agreementShare,
  agreementView,
  cancelSponsorship,
  defaultItems,
  eventOver,
  sideIn,
  sponsoredEvent,
} from "../lib/agreements.js"
import { todayInKorea } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { ensureMeasurement } from "../lib/measurements.js"
import { methodsOf, parseMethods } from "../lib/methods.js"
import { notify } from "../lib/notices.js"
import { parsePhoto, photoName, photoType, photos } from "../lib/photos.js"
import { isDemoAccount } from "../lib/reviews.js"
import { text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { AgreementItem, Database } from "../types.js"

export const agreementsRouter = Router()

// How much one agreement holds.
export const agreementLimits = { items: 12, links: 5, photos: 3 }

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
  if (!proposal || !side) throw new HttpError(404, "임시 전자 계약서를 찾을 수 없어요.")
  return { account, database, proposal, side }
}

// The same, to change: a sponsorship called off is only a record.
function openedToChange(req: Request) {
  const opening = opened(req)
  if (opening.proposal.canceled) throw new HttpError(409, "취소된 협찬은 고칠 수 없어요.")
  return opening
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
      ...(proposal.canceled ? { canceled: true } : {}),
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
  // The event's goals show here, so its measurement is made the first time,
  // as opening the event would.
  const sponsored = sponsoredEvent(database, proposal)
  const measured = sponsored ? ensureMeasurement(database, sponsored.owner.id, sponsored.event).created : false
  if (created || measured) await saveDatabase()
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// Either side writes what each will do. An item kept keeps its proof; a
// change of any kind asks both sides to confirm again.
agreementsRouter.put("/:id/items", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
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
  await photos().remove(agreement.id, removed.flatMap((item) => item.photos))
  if (changed) {
    void notify(
      side === "group" ? proposal.brand.account : proposal.group.account,
      "sponsorships",
      "임시 전자 계약서가 바뀌었어요",
      [`${account.name}에서 '${proposal.eventName}' 임시 전자 계약서를 고쳤어요. 바뀐 내용을 보고 다시 확인해 주세요.`],
      `/agreements/${encodeURIComponent(agreement.id)}`,
    )
  }
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// Either side sets how the sponsorship is confirmed at the event (협찬 확인
// 방식) and which side confirms each method there, either or both, until the
// event begins (lib/methods.ts). Like the items, a change asks both sides to
// confirm again; the methods count once both have.
agreementsRouter.put("/:id/methods", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const methods = parseMethods(req.body?.methods)
  const sponsored = sponsoredEvent(database, proposal)
  if (sponsored) ensureMeasurement(database, sponsored.owner.id, sponsored.event)
  const share = agreementShare(database, proposal)
  if (!share) throw new HttpError(409, "행사가 정해진 협찬만 협찬 확인 방식을 정할 수 있어요.")
  if (share.event.date <= todayInKorea()) throw new HttpError(409, "행사가 시작돼 협찬 확인 방식을 더 바꿀 수 없어요.")
  const { agreement } = agreementFor(database, proposal)
  const changed = JSON.stringify(methods) !== JSON.stringify(methodsOf(share.measurement, share.sponsor))
  if (share.sponsor) share.sponsor.methods = methods
  else share.measurement.methods = methods
  if (changed) {
    agreement.confirmed = {}
    agreement.updatedAt = new Date().toISOString()
  }
  await saveDatabase()
  if (changed) {
    void notify(
      side === "group" ? proposal.brand.account : proposal.group.account,
      "sponsorships",
      "임시 전자 계약서가 바뀌었어요",
      [`${account.name}에서 '${proposal.eventName}' 협찬의 협찬 확인 방식을 바꿨어요. 바뀐 내용을 보고 다시 확인해 주세요.`],
      `/agreements/${encodeURIComponent(agreement.id)}`,
    )
  }
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// A side confirms the items and methods as they stand; the other side hears
// about it. Once both have, the methods as they stand are the ones that
// count at the event and in the results (`confirmedMethods`).
agreementsRouter.post("/:id/confirm", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const { agreement } = agreementFor(database, proposal)
  const now = new Date().toISOString()
  agreement.confirmed[side] = now
  agreement.updatedAt = now
  const both = Boolean(agreement.confirmed.group && agreement.confirmed.brand)
  const sponsored = sponsoredEvent(database, proposal)
  if (both && sponsored) {
    ensureMeasurement(database, sponsored.owner.id, sponsored.event)
    const share = agreementShare(database, proposal)
    if (share) {
      const methods = methodsOf(share.measurement, share.sponsor)
      if (share.sponsor) share.sponsor.confirmedMethods = methods
      else share.measurement.confirmedMethods = methods
    }
  }
  await saveDatabase()
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    "sponsorships",
    both ? "임시 전자 계약서를 양쪽 모두 확인했어요" : "임시 전자 계약서를 확인해 주세요",
    [`${account.name}에서 '${proposal.eventName}' 임시 전자 계약서를 확인했어요.`],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// Calling a sponsorship off takes both sides: one asks, saying why, until
// the event is over, and the other agrees or declines. A partner without
// an account can't answer, so then asking is enough. The shared demo
// accounts can't ask, as everyone trying the demo shares their
// sponsorships.
agreementsRouter.post("/:id/cancel", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 협찬을 취소할 수 없어요.")
  if (eventOver(database, proposal)) throw new HttpError(409, "끝난 행사의 협찬은 취소할 수 없어요.")
  const reason = text(req.body?.reason)
  if (!reason) throw new HttpError(400, "협찬을 취소하려는 이유를 적어 주세요.")
  if (reason.length > 200) throw new HttpError(400, "이유는 200자 이하로 적어 주세요.")
  const { agreement } = agreementFor(database, proposal)
  if (agreement.cancel) throw new HttpError(409, "이미 협찬 취소 요청이 있어요.")
  const now = new Date().toISOString()
  agreement.cancel = { by: side, reason, requestedAt: now }
  agreement.updatedAt = now
  const partner = side === "group" ? proposal.brand.account : proposal.group.account
  if (!partner) {
    agreement.cancel.canceledAt = now
    cancelSponsorship(database, proposal, now)
  }
  await saveDatabase()
  void notify(
    partner,
    "sponsorships",
    "협찬 취소 요청이 왔어요",
    [
      `${account.name}에서 '${proposal.eventName}' 협찬을 취소하자고 요청했어요.`,
      `이유: ${reason}`,
      "임시 전자 계약서에서 동의하거나 거절할 수 있어요.",
    ],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// The other side agrees, and the sponsorship is called off for both.
agreementsRouter.post("/:id/cancel/accept", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const { agreement } = agreementFor(database, proposal)
  if (!agreement.cancel) throw new HttpError(409, "협찬 취소 요청이 없어요.")
  if (agreement.cancel.by === side) throw new HttpError(409, "상대가 동의해야 협찬이 취소돼요.")
  const now = new Date().toISOString()
  agreement.cancel.canceledAt = now
  agreement.updatedAt = now
  cancelSponsorship(database, proposal, now)
  await saveDatabase()
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    "sponsorships",
    "협찬이 취소됐어요",
    [`${account.name}에서 '${proposal.eventName}' 협찬 취소에 동의했어요.`],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// The side that asked takes the request back, or the other side declines
// it; the sponsorship stays either way.
agreementsRouter.delete("/:id/cancel", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const { agreement } = agreementFor(database, proposal)
  if (!agreement.cancel) throw new HttpError(409, "협찬 취소 요청이 없어요.")
  const asked = agreement.cancel.by === side
  delete agreement.cancel
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    "sponsorships",
    asked ? "협찬 취소 요청을 거뒀어요" : "협찬 취소 요청이 거절됐어요",
    [
      asked
        ? `${account.name}에서 '${proposal.eventName}' 협찬 취소 요청을 거뒀어요. 협찬은 그대로예요.`
        : `${account.name}에서 '${proposal.eventName}' 협찬 취소 요청을 거절했어요. 협찬은 그대로예요.`,
    ],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// The side an item belongs to marks it done (or not yet) and keeps its links.
agreementsRouter.patch("/:id/items/:itemId", async (req, res) => {
  const { database, proposal, side } = openedToChange(req)
  const { agreement, item } = ownItem(database, proposal, req.params.itemId, side)
  const links = req.body?.links === undefined ? undefined : parseLinks(req.body.links)
  if (links) item.links = links
  if (req.body?.done === true) item.doneAt ??= new Date().toISOString()
  if (req.body?.done === false) delete item.doneAt
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// A photo as proof (lib/photos.ts: on disk, or in Postgres on Vercel);
// three per item.
agreementsRouter.post("/:id/items/:itemId/photos", async (req, res) => {
  const { database, proposal, side } = openedToChange(req)
  const { item } = ownItem(database, proposal, req.params.itemId, side)
  if (item.photos.length >= agreementLimits.photos) throw new HttpError(409, "사진은 할 일마다 3장까지 올릴 수 있어요.")
  const parsed = parsePhoto(req.body?.image)
  if (!parsed) throw new HttpError(400, "사진은 PNG, JPG, WebP로 올려 주세요.")
  const photo = parsed.name
  const store = photos()
  await store.put(proposal.id, photo, parsed.bytes)
  try {
    // Looked up again: the data may have been read anew while the photo went in.
    const fresh = ownItem(getDatabase(), proposal, req.params.itemId, side)
    fresh.item.photos.push(photo)
    fresh.agreement.updatedAt = new Date().toISOString()
    await saveDatabase()
    res.status(201).json({ agreement: agreementView(getDatabase(), fresh.agreement, proposal, side) })
  } catch (error) {
    // The data went back to before the photo; so does the photo store.
    await store.remove(proposal.id, [photo])
    throw error
  }
})

agreementsRouter.delete("/:id/items/:itemId/photos/:photo", async (req, res) => {
  const { database, proposal, side } = openedToChange(req)
  const { agreement, item } = ownItem(database, proposal, req.params.itemId, side)
  const photo = String(req.params.photo)
  if (!item.photos.includes(photo)) throw new HttpError(404, "사진을 찾을 수 없어요.")
  item.photos = item.photos.filter((entry) => entry !== photo)
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  await photos().remove(proposal.id, [photo])
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// A photo, for the two sides only; the page fetches it with the login token.
agreementsRouter.get("/:id/photos/:photo", async (req, res) => {
  const { database, proposal } = opened(req)
  const agreement = database.agreements.find((entry) => entry.id === proposal.id)
  const photo = String(req.params.photo)
  if (!photoName.test(photo) || !agreement?.items.some((item) => item.photos.includes(photo))) {
    throw new HttpError(404, "사진을 찾을 수 없어요.")
  }
  const bytes = await photos().get(proposal.id, photo)
  if (!bytes) throw new HttpError(404, "사진을 찾을 수 없어요.")
  res.type(photoType(photo))
  res.set("Cache-Control", "private, max-age=3600")
  res.send(bytes)
})
