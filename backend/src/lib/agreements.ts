import { randomUUID } from "node:crypto"

import { dropOrphanDisputes } from "./disputes.js"
import { todayInKorea } from "./dates.js"
import { feeState } from "./fees.js"
import { HttpError } from "./errors.js"
import { ensureMeasurement, pinMissesToday, pinsFrom, pinsOpen, rotatePin } from "./measurements.js"
import { activeMethodsOf, confirmsAt, isVenueKind, methodsOf, venueCountsOf } from "./methods.js"
import { payoutView } from "./payouts.js"
import { photos } from "./photos.js"
import { canReview, isDemoAccount, publicReview, reviewOpen } from "./reviews.js"
import { isSponsored } from "./sponsorships.js"
import type { Account, Agreement, AgreementItem, ChatSide, Database, EventItem } from "../types.js"

export { uploadsFolder } from "./photos.js"

// 양쪽이 보는 수락된 제안: 누가 속해 있는지(계정과 있으면 리스팅), 행사,
// 브랜드가 주는 것. 양쪽이 취소한 것은 계약서 기록으로 canceled 상태로
// 남는다.
export type AcceptedProposal = {
  id: string
  kind: Agreement["kind"]
  canceled: boolean
  group: { name: string; account?: Account; listingId?: string }
  brand: { name: string; account?: Account; listingId?: string }
  eventName: string
  // "YYYY-MM-DD". 없으면 "".
  eventDate: string
  // 행사 자체와 그 주인: 요청이면 단체의 행사, 제안이면 브랜드의 캠페인.
  eventId?: string
  eventOwner: ChatSide
  gives: string
  respondedAt?: string
}

const accepted = (status: string) => status === "수락" || status === "취소됨"

export function acceptedProposal(database: Database, id: string): AcceptedProposal | undefined {
  const request = database.requests.find((item) => item.id === id && accepted(item.status))
  if (request) {
    const groupAccount = database.accounts.find((account) => account.id === request.fromAccountId)
    return {
      id,
      kind: "request",
      canceled: request.status === "취소됨",
      group: { name: request.groupName, account: groupAccount, listingId: groupAccount?.groupId },
      brand: {
        name: database.brands.find((brand) => brand.id === request.brandId)?.name ?? "",
        account: database.accounts.find((account) => account.brandId === request.brandId),
        listingId: request.brandId,
      },
      eventName: request.eventName,
      eventDate: request.eventDate,
      eventId: request.eventId,
      eventOwner: "group",
      gives: request.ask,
      respondedAt: request.respondedAt,
    }
  }
  const offer = database.offers.find((item) => item.id === id && accepted(item.status))
  if (!offer) return undefined
  const brandAccount = database.accounts.find((account) => account.id === offer.fromAccountId)
  return {
    id,
    kind: "offer",
    canceled: offer.status === "취소됨",
    group: {
      name: database.groups.find((group) => group.id === offer.groupId)?.name ?? "",
      account: database.accounts.find((account) => account.groupId === offer.groupId),
      listingId: offer.groupId,
    },
    brand: { name: offer.brandName, account: brandAccount, listingId: offer.brandId ?? brandAccount?.brandId },
    eventName: offer.campaignName,
    eventDate: offer.campaignDate,
    eventId: offer.campaignId,
    eventOwner: "brand",
    gives: offer.offer,
    respondedAt: offer.respondedAt,
  }
}

// 협찬이 속한 행사. 그 행사의 주인 쪽이 아직 가지고 있을 때만이다
// (계정과 그 캘린더에 있는 행사).
export function sponsoredEvent(database: Database, proposal: AcceptedProposal) {
  const owner = proposal[proposal.eventOwner].account
  const event =
    owner && proposal.eventId ? (database.events[owner.id] ?? []).find((item) => item.id === proposal.eventId) : undefined
  return owner && event ? { owner, event } : undefined
}

// 협찬한 행사가 끝났는지: 마지막 날이 지났다.
export function eventOver(database: Database, proposal: AcceptedProposal) {
  const event = sponsoredEvent(database, proposal)?.event
  const lastDay = event ? (event.endDate ?? event.date) : proposal.eventDate
  return Boolean(lastDay) && lastDay < todayInKorea()
}

// 양쪽이 협찬을 취소했다. 제안은 취소가 되고 브랜드의 협찬 기록과 행사
// 측정에서 그 몫이 사라진다. 그래서 결과, 알림, 캘린더 날짜도 함께 없어지고
// 그 협찬의 후기도 없어진다. 다른 협찬이 없으면 행사는 다시 매칭 중이 된다.
export function cancelSponsorship(database: Database, proposal: AcceptedProposal, now: string) {
  const stored =
    proposal.kind === "request"
      ? database.requests.find((item) => item.id === proposal.id)
      : database.offers.find((item) => item.id === proposal.id)
  if (!stored) return
  stored.status = "취소됨"
  stored.canceledAt = now
  const sponsorshipId = `sp-${proposal.id}`
  for (const [brandAccountId, list] of Object.entries(database.sponsorships)) {
    database.sponsorships[brandAccountId] = list.filter((item) => item.id !== sponsorshipId)
  }
  for (const measurement of database.measurements) {
    measurement.sponsors = measurement.sponsors.filter((sponsor) => sponsor.id !== sponsorshipId)
  }
  database.reviews = database.reviews.filter((review) => review.proposalId !== proposal.id)
  const sponsored = sponsoredEvent(database, proposal)
  if (sponsored && sponsored.event.status === "집행 예정" && !isSponsored(database, sponsored.event.id)) {
    sponsored.event.status = "매칭 중"
  }
}

// 계약서가 측정하는 협찬 행사 측정의 일부: 학생 행사에서는 브랜드 자신의
// 몫(그 협찬), 브랜드 캠페인에서는 캠페인 자체로 협찬사가 없다. 행사에
// 측정이 생기기 전에는 undefined다.
export function agreementShare(database: Database, proposal: AcceptedProposal) {
  const sponsored = sponsoredEvent(database, proposal)
  const measurement =
    sponsored &&
    database.measurements.find((item) => item.accountId === sponsored.owner.id && item.eventId === sponsored.event.id)
  if (!sponsored || !measurement) return undefined
  if (proposal.kind === "offer") return { event: sponsored.event, measurement, sponsor: undefined }
  const sponsor = measurement.sponsors.find((item) => item.id === `sp-${proposal.id}`)
  return sponsor ? { event: sponsored.event, measurement, sponsor } : undefined
}

// 전자계약서의 몫을 행사에서 어떻게 확인하는지: 여기서 정한 방식, 양쪽이
// 마지막으로 확인한 방식(이쪽만 효력이 있고 있을 때만), 행사장이 센 것,
// 그리고 확인된 방식으로 이쪽이 행사에서 기록할 것(손으로 센 집계나
// 매장 방문)이 생기면 자기 행사장 페이지와 PIN이다. 브랜드는 직원
// 페이지의 매장 PIN, 단체는 자기 페이지의 PIN이다.
function measureView(database: Database, proposal: AcceptedProposal, side: ChatSide) {
  const share = agreementShare(database, proposal)
  if (!share) return undefined
  const { event, measurement, sponsor } = share
  const methods = methodsOf(measurement, sponsor)
  const confirmed = sponsor ? sponsor.confirmedMethods : measurement.confirmedMethods
  const counts = sponsor?.metrics ?? measurement.metrics
  const pin = side === "brand" ? (sponsor?.staffPin ?? measurement.staffPin) : measurement.groupPin
  const demo = isDemoAccount(database, side === "brand" ? proposal.brand.account : proposal.group.account)
  const mine = activeMethodsOf(measurement, sponsor).some(
    (method) => confirmsAt(method, side) && (isVenueKind(method.kind) || method.kind === "visit"),
  )
  return {
    code: measurement.code,
    methods,
    ...(confirmed ? { confirmedMethods: confirmed } : {}),
    counts: { scans: measurement.metrics.scans, coupons: counts.coupons, visits: counts.visits, ...venueCountsOf(counts) },
    // 여러 단체가 함께하는 캠페인의 단체 PIN은 캠페인을 연 브랜드가 바꾼다.
    ...(side === "brand" && !demo && pinsOpen(database, measurement, event) && campaignGroups(database, proposal).length > 1
      ? { canRotateGroupPin: true }
      : {}),
    ...(mine
      ? {
          venue: {
            page: side === "brand" ? ("staff" as const) : ("group" as const),
            // 각 측의 PIN은 행사 하루 전부터 보인다.
            ...(pinsOpen(database, measurement, event)
              ? {
                  pin,
                  misses: pinMissesToday(measurement),
                  canRotate: !demo && !(side === "group" && campaignGroups(database, proposal).length > 1),
                }
              : { pinsFrom: pinsFrom(event) }),
          },
        }
      : {}),
  }
}

// 브랜드 캠페인을 함께하는 단체들의 제안. 단체 PIN은 캠페인에 하나뿐이어서
// 이들이 함께 쓴다.
export function campaignGroups(database: Database, proposal: AcceptedProposal) {
  const owner = proposal.brand.account
  if (proposal.kind !== "offer" || !owner) return []
  return acceptedProposalsOf(database, owner).filter(
    (item) => item.kind === "offer" && item.eventId === proposal.eventId && !item.canceled,
  )
}

// 함께 쓰는 단체 PIN을 캠페인을 연 브랜드가 새로 만든다. 알릴 단체를 돌려준다.
export function rotateCampaignGroupPin(database: Database, proposal: AcceptedProposal) {
  const share = agreementShare(database, proposal)
  if (!share || !measureView(database, proposal, "brand")?.canRotateGroupPin) {
    throw new HttpError(409, "PIN은 보이는 날부터 바꿀 수 있어요.")
  }
  rotatePin(share.measurement, undefined, "group")
  return campaignGroups(database, proposal)
}

// 계약서에서 이쪽 PIN을 새로 만든다. 이쪽에 PIN이 보일 때만 바꿀 수 있고, 다른
// 단체와 함께 쓰는 PIN은 한 단체가 바꾸지 못한다.
export function rotateVenuePin(database: Database, proposal: AcceptedProposal, side: ChatSide) {
  if (side === "group" && campaignGroups(database, proposal).length > 1) {
    throw new HttpError(409, "여러 단체가 함께 쓰는 PIN은 브랜드가 바꿔요.")
  }
  const share = agreementShare(database, proposal)
  const venue = measureView(database, proposal, side)?.venue
  if (!share || !venue || !("pin" in venue)) {
    throw new HttpError(409, "PIN은 보이는 날부터 바꿀 수 있어요.")
  }
  rotatePin(share.measurement, share.sponsor, side)
}

// 수락된 제안에서 계정이 맡는 쪽. 없으면 없음.
export function sideIn(proposal: AcceptedProposal, account: Account): ChatSide | undefined {
  if (proposal.group.account?.id === account.id) return "group"
  if (proposal.brand.account?.id === account.id) return "brand"
  return undefined
}

// 계정이 속한 수락된 제안. 최근에 답한 순서다.
export function acceptedProposalsOf(database: Database, account: Account) {
  const ids = [
    ...database.requests.filter((item) => accepted(item.status)).map((item) => item.id),
    ...database.offers.filter((item) => accepted(item.status)).map((item) => item.id),
  ]
  return ids
    .flatMap((id) => {
      const proposal = acceptedProposal(database, id)
      return proposal && sideIn(proposal, account) ? [proposal] : []
    })
    .sort((a, b) => (b.respondedAt ?? "").localeCompare(a.respondedAt ?? ""))
}

const item = (side: ChatSide, label: string): AgreementItem => ({ id: randomUUID(), side, label, links: [], photos: [] })

// 협찬이 보통 거치는 일, 시작점으로 쓴다. 브랜드는 주는 것을 넘기고 쿠폰을
// 준비하며, 단체는 행사를 알리고 브랜드를 그곳에 보여 주고 쿠폰을 나눠 준 뒤
// 결과를 공유한다.
export function defaultItems(proposal: AcceptedProposal, promo?: EventItem["promo"]): AgreementItem[] {
  // 행사에 단체 자신의 홍보 · 배포 계획이 있으면 보통의 홍보 항목을
  // 대신한다: 로고가 들어갈 곳, 물품을 나눠 주는 방법, 약속한 게시물.
  const promised = promo
    ? [
        ...(promo.spots.length ? [item("group", `로고 노출: ${promo.spots.join(", ")}`.slice(0, 80))] : []),
        ...(promo.handouts.length ? [item("group", `현장 배포: ${promo.handouts.join(", ")}`.slice(0, 80))] : []),
        ...promo.posts.slice(0, 5).map((post) => item("group", `SNS 홍보: ${post}`)),
      ]
    : []
  return [
    item("brand", `협찬 전달: ${proposal.gives}`.slice(0, 80)),
    item("brand", "행사용 쿠폰과 매장 직원 안내 준비"),
    ...(promised.length
      ? promised
      : [item("group", "행사 전 SNS 홍보 게시물 올리기"), item("group", "행사장에 브랜드 보여 주기(현수막·부스·무대 소개)")]),
    item("group", "참여자에게 쿠폰 나눠 주기"),
    item("group", "행사 후 사진과 성과 리포트 공유하기"),
  ]
}

// 제안이 가리키는 단체 행사의 홍보 · 배포 계획. 있으면 돌려준다.
export const promoOf = (database: Database, proposal: AcceptedProposal) =>
  proposal.eventOwner === "group" ? sponsoredEvent(database, proposal)?.event.promo : undefined

// 저장된 계약서, 없으면 보통의 항목으로 새로 만든 것(저장은 호출한 쪽이 한다).
export function agreementFor(database: Database, proposal: AcceptedProposal) {
  const stored = database.agreements.find((agreement) => agreement.id === proposal.id)
  if (stored) return { agreement: stored, created: false }
  const now = new Date().toISOString()
  const agreement: Agreement = {
    id: proposal.id,
    kind: proposal.kind,
    items: defaultItems(proposal, promoOf(database, proposal)),
    confirmed: {},
    createdAt: now,
    updatedAt: now,
  }
  database.agreements.push(agreement)
  return { agreement, created: true }
}

// 계약서와 그 제안을 보는 쪽 기준으로 보여 준다. 행사(누구의 것인지, 시작
// 했는지: 시작 전까지 목표와 측정 방식은 계약서에서 정한다), 양쪽이 읽는
// 목표(주인만 가진 PIN과 쿠폰은 뺀다), 이쪽 행사장 PIN을 곁들인 측정
// 방식, 후기(이쪽이 지금 쓸 수 있는지, 이쪽의 것과 상대의 것), 취소
// 요청과 이쪽이 요청할 수 있는지를 담는다. 취소된 계약은 기록일 뿐이라
// 항목과 요청만 담는다. 한쪽이 계약서를 현재 상태 그대로 확인한다. 양쪽이
// 확인하면 그때의 확인 방식이 행사와 결과에서 효력을 갖는다
// (`confirmedMethods`). 양쪽이 확인했는지 답한다.
// 각 쪽이 본 예상 인원의 작은 값이 QR 상한의 기준이다. 한쪽이 본 뒤에 주인이
// 올려도 상한은 오르지 않는다.
export function noteSeenAudience(database: Database, agreement: Agreement, proposal: AcceptedProposal) {
  const seen = agreementShare(database, proposal)?.measurement.goals.expectedAudience
  if (seen !== undefined) agreement.seenAudience = Math.min(agreement.seenAudience ?? seen, seen)
}

export function confirmAgreement(database: Database, agreement: Agreement, proposal: AcceptedProposal, side: ChatSide) {
  const now = new Date().toISOString()
  agreement.confirmed[side] = now
  agreement.updatedAt = now
  const both = Boolean(agreement.confirmed.group && agreement.confirmed.brand)
  const sponsored = sponsoredEvent(database, proposal)
  noteSeenAudience(database, agreement, proposal)
  if (both && sponsored) {
    ensureMeasurement(database, sponsored.owner.id, sponsored.event)
    const share = agreementShare(database, proposal)
    if (share) {
      const methods = methodsOf(share.measurement, share.sponsor)
      if (share.sponsor) share.sponsor.confirmedMethods = methods
      else share.measurement.confirmedMethods = methods
      share.measurement.agreedAudience ??= agreement.seenAudience
    }
  }
  return both
}

export function agreementView(database: Database, agreement: Agreement, proposal: AcceptedProposal, side: ChatSide) {
  const other: ChatSide = side === "group" ? "brand" : "group"
  const review = (by: ChatSide) => database.reviews.find((item) => item.id === `${proposal.id}:${by}`)
  const mine = review(side)
  const theirs = review(other)
  const sponsored = proposal.canceled ? undefined : sponsoredEvent(database, proposal)
  const measurement =
    sponsored &&
    database.measurements.find((item) => item.accountId === sponsored.owner.id && item.eventId === sponsored.event.id)
  const measure = measureView(database, proposal, side)
  return {
    ...agreement,
    side,
    // 각 측의 연락처. 수락된 제안의 두 측만 본다.
    group: {
      name: proposal.group.name,
      member: Boolean(proposal.group.account),
      ...(proposal.group.account?.contact ? { contact: proposal.group.account.contact } : {}),
    },
    brand: {
      name: proposal.brand.name,
      member: Boolean(proposal.brand.account),
      ...(proposal.brand.account?.contact ? { contact: proposal.brand.account.contact } : {}),
    },
    eventName: proposal.eventName,
    eventDate: proposal.eventDate,
    ...(sponsored
      ? { event: { id: sponsored.event.id, owner: proposal.eventOwner, started: sponsored.event.date <= todayInKorea() } }
      : {}),
    ...(measurement
      ? { goals: { expectedAudience: measurement.goals.expectedAudience, targets: measurement.goals.targets } }
      : {}),
    ...(measure && !proposal.canceled ? { measure } : {}),
    gives: proposal.gives,
    fee: feeState(database, agreement, proposal),
    payout: payoutView(agreement),
    review: {
      open: reviewOpen(proposal),
      canWrite: canReview(database, proposal, side),
      // 이쪽은 상대가 쓴 후기에 답할 수 있다(데모 계정은 제외).
      canReply: Boolean(theirs && !theirs.hiddenAt) && !isDemoAccount(database, proposal[side].account),
      ...(mine ? { mine: publicReview(mine) } : {}),
      ...(theirs ? { theirs: publicReview(theirs) } : {}),
    },
    cancelable:
      !proposal.canceled &&
      !agreement.cancel &&
      !eventOver(database, proposal) &&
      !isDemoAccount(database, proposal[side].account),
  }
}

// 제안이 없어진(한쪽이 탈퇴한) 계약서도 그 분쟁과 함께 지운다. 사진 폴더는
// 데이터를 저장한 뒤 지우도록 돌려준다.
export function dropOrphanAgreements(database: Database) {
  const gone = database.agreements.filter((agreement) => !acceptedProposal(database, agreement.id))
  database.agreements = database.agreements.filter((agreement) => !gone.includes(agreement))
  return [...gone.map((agreement) => agreement.id), ...dropOrphanDisputes(database)]
}

export async function removeUploads(agreementIds: string[]) {
  await photos().removeAll(agreementIds)
}
