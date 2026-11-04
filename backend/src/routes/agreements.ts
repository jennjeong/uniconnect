import { randomUUID } from "node:crypto"
import { Router, type Request } from "express"

import {
  acceptedProposal,
  acceptedProposalsOf,
  type AcceptedProposal,
  agreementFor,
  agreementShare,
  confirmAgreement,
  agreementView,
  cancelSponsorship,
  defaultItems,
  promoOf,
  eventOver,
  sideIn,
  sponsoredEvent,
} from "../lib/agreements.js"
import { todayInKorea } from "../lib/dates.js"
import { feeState, parseValue } from "../lib/fees.js"
import { rewardReferrals, tellReferrers } from "../lib/referrals.js"
import { HttpError } from "../lib/errors.js"
import { ensureMeasurement } from "../lib/measurements.js"
import { methodsOf, parseMethods } from "../lib/methods.js"
import { notify } from "../lib/notices.js"
import { parsePhoto, photoName, photoType, photos } from "../lib/photos.js"
import { isDemoAccount } from "../lib/reviews.js"
import { fetchViews, parsePostUrl, postLimits } from "../lib/snsPosts.js"
import { carriers, text } from "../lib/validation.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { AgreementItem, Database, SnsPost } from "../types.js"

export const agreementsRouter = Router()

// 계약서 하나가 담을 수 있는 양이다.
export const agreementLimits = { items: 12, links: 5, photos: 3, shipments: 10 }

// 증빙 링크는 http나 https 주소만 받는다.
function parseLinks(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError(400, "링크 목록을 다시 확인해 주세요.")
  const links = value.map(text).filter(Boolean)
  if (links.length > agreementLimits.links) throw new HttpError(400, "링크는 5개까지 붙일 수 있어요.")
  return links.map((link) => {
    try {
      const url = new URL(link)
      if ((url.protocol === "http:" || url.protocol === "https:") && link.length <= 300) return url.href
    } catch {
      // 주소가 아니므로 아래에서 답한다.
    }
    throw new HttpError(400, "링크는 http:// 또는 https://로 시작하는 주소로 적어 주세요.")
  })
}

// 주소가 가리키는 수락된 제안을 두 쪽 중 한쪽만의 입장에서 가져온다.
function opened(req: Request) {
  const account = requireAccount(req)
  const database = getDatabase()
  const proposal = acceptedProposal(database, String(req.params.id))
  const side = proposal && sideIn(proposal, account)
  if (!proposal || !side) throw new HttpError(404, "임시 전자 계약서를 찾을 수 없어요.")
  return { account, database, proposal, side }
}

// 바꾸기 위한 같은 조회다. 취소된 협찬은 기록일 뿐이다.
function openedToChange(req: Request) {
  const opening = opened(req)
  if (opening.proposal.canceled) throw new HttpError(409, "취소된 협찬은 고칠 수 없어요.")
  return opening
}

// 이미 연 계약서의 항목 하나다. 그 항목이 속한 쪽만 완료로 표시하거나
// 증빙한다.
function ownItem(database: Database, proposal: AcceptedProposal, itemId: unknown, side: AgreementItem["side"]) {
  const agreement = database.agreements.find((entry) => entry.id === proposal.id)
  const item = agreement?.items.find((entry) => entry.id === String(itemId))
  if (!agreement || !item) throw new HttpError(404, "약속한 일을 찾을 수 없어요.")
  if (item.side !== side) throw new HttpError(403, "상대가 할 일은 상대만 표시할 수 있어요.")
  return { agreement, item }
}

// 계약서의 SNS 게시물과 그것을 다룰 권한. 학생단체가 올리고 브랜드가 확인하며,
// 공용 데모 계정은 어느 쪽도 할 수 없다.
function ownPost(
  { account, database, proposal, side }: ReturnType<typeof opened>,
  postId: unknown,
  actor: AgreementItem["side"],
) {
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 SNS 게시물을 다룰 수 없어요.")
  if (side !== actor) {
    throw new HttpError(403, actor === "group" ? "게시물은 학생단체가 올려요." : "게시물은 브랜드가 확인해요.")
  }
  const agreement = database.agreements.find((entry) => entry.id === proposal.id)
  const post = agreement?.snsPosts?.find((entry) => entry.id === String(postId))
  if (!agreement || !post) throw new HttpError(404, "게시물을 찾을 수 없어요.")
  return { agreement, post }
}

function parsePost(body: unknown) {
  const input = (body ?? {}) as { url?: unknown; reach?: unknown }
  const reach = Number(input.reach)
  if (!Number.isInteger(reach) || reach < 0 || reach > postLimits.reach) {
    throw new HttpError(400, "도달 수를 0 이상의 숫자로 적어 주세요.")
  }
  return { url: parsePostUrl(input.url), reach }
}

// 게시물 소식을 상대에게 알린다. 메일이 설정되면 메일로 간다.
function tellAboutPost(
  { account, proposal, side }: ReturnType<typeof opened>,
  subject: string,
  line: string,
) {
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    "sponsorships",
    subject,
    [`${account.name}에서 '${proposal.eventName}' ${line}`],
    `/agreements/${encodeURIComponent(proposal.id)}`,
  )
}

// 계정의 수락된 제안과 계약서가 어디까지 왔는지를 보여 준다. 확정 여부, 끝난
// 항목, 지금까지의 증빙을 담는다.
agreementsRouter.get("/", (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const agreements = acceptedProposalsOf(database, account).map((proposal) => {
    const side = sideIn(proposal, account)!
    const stored = database.agreements.find((agreement) => agreement.id === proposal.id)
    const items = stored?.items ?? defaultItems(proposal, promoOf(database, proposal))
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
  // 행사의 목표가 여기 보이므로, 행사를 열 때처럼 측정을 처음에 만든다.
  const sponsored = sponsoredEvent(database, proposal)
  const measured = sponsored ? ensureMeasurement(database, sponsored.owner.id, sponsored.event).created : false
  if (created || measured) await saveDatabase()
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 양쪽이 각자 할 일을 쓴다. 유지한 항목은 증빙도 유지하고, 어떤 변경이든
// 양쪽이 다시 확정하게 한다.
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

// 양쪽 중 어느 쪽이든 행사가 시작되기 전까지 협찬을 행사에서 어떻게 확인할지
// (협찬 확인 방식)와 각 방법을 어느 쪽이 확인할지(한쪽 또는 양쪽)를 정한다
// (lib/methods.ts). 항목처럼 바꾸면 양쪽이 다시 확정해야 하고, 방법은 양쪽이
// 확정한 뒤에 센다.
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

// 협찬의 가치로 현금과 현물을 말하며, 행사가 시작되기 전까지 어느 쪽이든 쓸
// 수 있다. 바꾸면 양쪽이 다시 확정해야 하고, 가치가 오르면 수수료의 차액을
// 더 내야 한다.
agreementsRouter.put("/:id/value", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const value = parseValue(req.body?.value)
  if (eventOver(database, proposal)) throw new HttpError(409, "끝난 행사의 협찬액은 바꿀 수 없어요.")
  const { agreement } = agreementFor(database, proposal)
  const changed = JSON.stringify(value) !== JSON.stringify(agreement.value ?? null)
  agreement.value = value
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
      [`${account.name}에서 '${proposal.eventName}' 협찬의 협찬액을 바꿨어요. 바뀐 내용을 보고 다시 확인해 주세요.`],
      `/agreements/${encodeURIComponent(agreement.id)}`,
    )
  }
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 한쪽이 보낸 소포(택배사와 운송장 번호)를 적으면 상대편이 알림을 받는다.
// 보낸 소포는 합의한 내용을 바꾸지 않으므로 확정은 그대로 남는다.
agreementsRouter.post("/:id/shipments", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const carrier = text(req.body?.carrier)
  const number = text(req.body?.number).replace(/[\s-]/g, "")
  const note = text(req.body?.note).slice(0, 60)
  if (!(carriers as readonly string[]).includes(carrier)) throw new HttpError(400, "택배사를 목록에서 골라 주세요.")
  if (!/^[A-Za-z0-9]{6,20}$/.test(number)) throw new HttpError(400, "운송장 번호는 숫자나 영문 6~20자로 적어 주세요.")
  const { agreement } = agreementFor(database, proposal)
  const shipments = (agreement.shipments ??= [])
  if (shipments.length >= agreementLimits.shipments) throw new HttpError(400, "배송은 10건까지 남길 수 있어요.")
  shipments.push({ id: randomUUID(), side, carrier, number, ...(note ? { note } : {}), addedAt: new Date().toISOString() })
  await saveDatabase()
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    "sponsorships",
    "협찬 물품을 보냈어요",
    [`${account.name}에서 '${proposal.eventName}' 협찬 물품을 ${carrier}로 보냈어요. 운송장 번호는 ${number}예요.`],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.status(201).json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 소포를 적은 쪽이 그것을 뺀다(예를 들어 번호가 틀렸을 때).
agreementsRouter.delete("/:id/shipments/:shipmentId", async (req, res) => {
  const { database, proposal, side } = openedToChange(req)
  const { agreement } = agreementFor(database, proposal)
  const shipment = agreement.shipments?.find((item) => item.id === String(req.params.shipmentId))
  if (!shipment) throw new HttpError(404, "배송을 찾을 수 없어요.")
  if (shipment.side !== side) throw new HttpError(403, "상대가 남긴 배송은 상대만 지울 수 있어요.")
  agreement.shipments = agreement.shipments!.filter((item) => item !== shipment)
  if (agreement.shipments.length === 0) delete agreement.shipments
  await saveDatabase()
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 한쪽이 지금 상태의 항목, 방법, 가치를 확정하면 상대편이 알림을 받는다.
// 브랜드는 아직 내야 하는 수수료(lib/fees.ts)를 내는 것으로 확정하며, 내고
// 나면 확정된 것으로 본다. 낼 것이 없으면 여기서 확정한다.
agreementsRouter.post("/:id/confirm", async (req, res) => {
  const { account, database, proposal, side } = openedToChange(req)
  const { agreement } = agreementFor(database, proposal)
  if (side === "brand") {
    const fee = feeState(database, agreement, proposal)
    if (fee.needsValue) throw new HttpError(409, "협찬액(현금과 현물 환산)을 먼저 적어 주세요. 수수료는 그 금액으로 정해져요.")
    if (fee.due > 0) throw new HttpError(402, "플랫폼 수수료를 결제하면 확인돼요.")
  }
  const both = confirmAgreement(database, agreement, proposal, side)
  // Each side's first confirmed sponsorship rewards whoever invited it (친구 초대).
  const rewarded = both ? rewardReferrals(database, [proposal.group.account, proposal.brand.account]) : []
  await saveDatabase()
  tellReferrers(rewarded)
  void notify(
    side === "group" ? proposal.brand.account : proposal.group.account,
    "sponsorships",
    both ? "임시 전자 계약서를 양쪽 모두 확인했어요" : "임시 전자 계약서를 확인해 주세요",
    [`${account.name}에서 '${proposal.eventName}' 임시 전자 계약서를 확인했어요.`],
    `/agreements/${encodeURIComponent(agreement.id)}`,
  )
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 협찬을 취소하려면 양쪽이 필요하다. 한쪽이 이유를 말하며 행사가 끝나기
// 전까지 요청하고, 다른 쪽이 동의하거나 거절한다. 계정이 없는 파트너는
// 답할 수 없으므로 그때는 요청만으로 충분하다. 공유 데모 계정은 데모를 써
// 보는 모두가 협찬을 함께 쓰므로 요청할 수 없다.
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

// 상대편이 동의하면 협찬이 양쪽 모두에서 취소된다.
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

// 요청한 쪽이 요청을 거두거나 상대편이 거절한다. 어느 쪽이든 협찬은
// 그대로 남는다.
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

// 학생단체가 브랜드가 확인할 SNS 게시물을 올린다.
agreementsRouter.post("/:id/sns-posts", async (req, res) => {
  const opening = openedToChange(req)
  const { account, database, proposal, side } = opening
  if (isDemoAccount(database, account)) throw new HttpError(403, "데모 계정은 SNS 게시물을 다룰 수 없어요.")
  if (side !== "group") throw new HttpError(403, "게시물은 학생단체가 올려요.")
  const { agreement } = agreementFor(database, proposal)
  const posts = agreement.snsPosts ?? []
  if (posts.length >= postLimits.posts) throw new HttpError(400, "게시물은 10개까지 올릴 수 있어요.")
  const { url, reach } = parsePost(req.body)
  if (posts.some((post) => post.url === url)) throw new HttpError(409, "이미 올린 게시물이에요.")
  const post: SnsPost = { id: randomUUID(), url, reach, photos: [], status: "pending", addedAt: new Date().toISOString() }
  await fetchViews(post)
  // 호출하는 동안 데이터를 새로 읽었을 수 있어 다시 찾는다.
  const fresh = agreementFor(getDatabase(), proposal).agreement
  ;(fresh.snsPosts ??= []).push(post)
  fresh.updatedAt = post.addedAt
  await saveDatabase()
  tellAboutPost(opening, "확인할 SNS 게시물이 올라왔어요", "협찬 게시물을 올렸어요. 계약서에서 확인해 주세요.")
  res.status(201).json({ agreement: agreementView(getDatabase(), fresh, proposal, side) })
})

// 학생단체가 게시물을 고치면 다시 브랜드의 확인을 기다린다.
agreementsRouter.put("/:id/sns-posts/:postId", async (req, res) => {
  const opening = openedToChange(req)
  const { database, proposal, side } = opening
  const { agreement, post } = ownPost(opening, req.params.postId, "group")
  const { url, reach } = parsePost(req.body)
  if (agreement.snsPosts!.some((entry) => entry !== post && entry.url === url)) throw new HttpError(409, "이미 올린 게시물이에요.")
  if (url !== post.url) delete post.youtube
  post.url = url
  post.reach = reach
  post.status = "pending"
  delete post.reason
  if (!post.youtube) await fetchViews(post)
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  tellAboutPost(opening, "확인할 SNS 게시물이 올라왔어요", "협찬 게시물을 고쳤어요. 계약서에서 다시 확인해 주세요.")
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

agreementsRouter.delete("/:id/sns-posts/:postId", async (req, res) => {
  const opening = openedToChange(req)
  const { database, proposal, side } = opening
  const { agreement, post } = ownPost(opening, req.params.postId, "group")
  agreement.snsPosts = agreement.snsPosts!.filter((entry) => entry !== post)
  if (agreement.snsPosts.length === 0) delete agreement.snsPosts
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  await photos().remove(proposal.id, post.photos)
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 브랜드가 확인한 게시물은 그때부터 리포트에 들어간다.
agreementsRouter.post("/:id/sns-posts/:postId/confirm", async (req, res) => {
  const opening = openedToChange(req)
  const { database, proposal, side } = opening
  const { agreement, post } = ownPost(opening, req.params.postId, "brand")
  post.status = "confirmed"
  delete post.reason
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  tellAboutPost(opening, "SNS 게시물이 확인됐어요", "협찬 게시물을 확인했어요. 리포트의 도달에 들어가요.")
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 브랜드가 이유를 한 줄로 적어 다시 요청한다.
agreementsRouter.post("/:id/sns-posts/:postId/reject", async (req, res) => {
  const opening = openedToChange(req)
  const { database, proposal, side } = opening
  const { agreement, post } = ownPost(opening, req.params.postId, "brand")
  const reason = text(req.body?.reason)
  if (!reason || reason.length > postLimits.reason) throw new HttpError(400, "다시 요청하는 이유를 100자 안으로 적어 주세요.")
  post.status = "rejected"
  post.reason = reason
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  tellAboutPost(opening, "SNS 게시물을 다시 요청했어요", `협찬 게시물을 다시 요청했어요. 이유: ${reason}`)
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 게시물 도달의 캡처. 항목의 증빙 사진처럼 보관한다.
agreementsRouter.post("/:id/sns-posts/:postId/photos", async (req, res) => {
  const opening = openedToChange(req)
  const { proposal, side } = opening
  const { post } = ownPost(opening, req.params.postId, "group")
  if (post.photos.length >= postLimits.photos) throw new HttpError(409, "캡처는 게시물마다 3장까지 올릴 수 있어요.")
  const parsed = parsePhoto(req.body?.image)
  if (!parsed) throw new HttpError(400, "사진은 PNG, JPG, WebP로 올려 주세요.")
  const photo = parsed.name
  const store = photos()
  await store.put(proposal.id, photo, parsed.bytes)
  try {
    const fresh = ownPost({ ...opening, database: getDatabase() }, req.params.postId, "group")
    fresh.post.photos.push(photo)
    fresh.agreement.updatedAt = new Date().toISOString()
    await saveDatabase()
    res.status(201).json({ agreement: agreementView(getDatabase(), fresh.agreement, proposal, side) })
  } catch (error) {
    await store.remove(proposal.id, [photo])
    throw error
  }
})

agreementsRouter.delete("/:id/sns-posts/:postId/photos/:photo", async (req, res) => {
  const opening = openedToChange(req)
  const { database, proposal, side } = opening
  const { agreement, post } = ownPost(opening, req.params.postId, "group")
  const photo = String(req.params.photo)
  if (!post.photos.includes(photo)) throw new HttpError(404, "사진을 찾을 수 없어요.")
  post.photos = post.photos.filter((entry) => entry !== photo)
  agreement.updatedAt = new Date().toISOString()
  await saveDatabase()
  await photos().remove(proposal.id, [photo])
  res.json({ agreement: agreementView(database, agreement, proposal, side) })
})

// 항목이 속한 쪽이 항목을 완료로(또는 아직으로) 표시하고 링크를 보관한다.
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

// 증빙 사진이다(lib/photos.ts. 디스크에 두고, Vercel에서는 Postgres에 둔다).
// 항목마다 세 장까지다.
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
    // 다시 찾는다. 사진이 들어오는 동안 데이터를 새로 읽었을 수 있다.
    const fresh = ownItem(getDatabase(), proposal, req.params.itemId, side)
    fresh.item.photos.push(photo)
    fresh.agreement.updatedAt = new Date().toISOString()
    await saveDatabase()
    res.status(201).json({ agreement: agreementView(getDatabase(), fresh.agreement, proposal, side) })
  } catch (error) {
    // 데이터가 사진을 넣기 전으로 돌아갔으므로 사진 저장소도 돌린다.
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

// 양쪽에게만 사진을 보여 준다. 페이지는 로그인 토큰으로 가져온다.
agreementsRouter.get("/:id/photos/:photo", async (req, res) => {
  const { database, proposal } = opened(req)
  const agreement = database.agreements.find((entry) => entry.id === proposal.id)
  const photo = String(req.params.photo)
  const kept = [...(agreement?.items ?? []), ...(agreement?.snsPosts ?? [])].some((item) => item.photos.includes(photo))
  if (!photoName.test(photo) || !kept) {
    throw new HttpError(404, "사진을 찾을 수 없어요.")
  }
  const bytes = await photos().get(proposal.id, photo)
  if (!bytes) throw new HttpError(404, "사진을 찾을 수 없어요.")
  res.type(photoType(photo))
  res.set("Cache-Control", "private, max-age=3600")
  res.send(bytes)
})
