import { randomUUID } from "node:crypto"

import { todayInKorea } from "./dates.js"
import { activeMethodsOf, confirmsAt, isVenueKind, methodsOf, venueCountsOf } from "./methods.js"
import { photos } from "./photos.js"
import { canReview, isDemoAccount, publicReview, reviewOpen } from "./reviews.js"
import { isSponsored } from "./sponsorships.js"
import type { Account, Agreement, AgreementItem, ChatSide, Database } from "../types.js"

export { uploadsFolder } from "./photos.js"

// An accepted proposal as both sides see it: who is in it (their accounts
// and listings when they have them), the event and what the brand gives.
// One both sides called off stays, as canceled, for its agreement's record.
export type AcceptedProposal = {
  id: string
  kind: Agreement["kind"]
  canceled: boolean
  group: { name: string; account?: Account; listingId?: string }
  brand: { name: string; account?: Account; listingId?: string }
  eventName: string
  // "YYYY-MM-DD", or "" while there is none.
  eventDate: string
  // The event itself and whose it is: a group's event for a request, a
  // brand's campaign for an offer.
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

// The event a sponsorship is for, while the side whose event it is still
// has it (an account and the event on its calendar).
export function sponsoredEvent(database: Database, proposal: AcceptedProposal) {
  const owner = proposal[proposal.eventOwner].account
  const event =
    owner && proposal.eventId ? (database.events[owner.id] ?? []).find((item) => item.id === proposal.eventId) : undefined
  return owner && event ? { owner, event } : undefined
}

// Whether the sponsored event is over: its last day has gone.
export function eventOver(database: Database, proposal: AcceptedProposal) {
  const event = sponsoredEvent(database, proposal)?.event
  const lastDay = event ? (event.endDate ?? event.date) : proposal.eventDate
  return Boolean(lastDay) && lastDay < todayInKorea()
}

// Both sides called the sponsorship off. Its proposal is 취소, and the
// brand's record of it and its share of the event's measurement go, so its
// results, reminders and calendar day go with them, as does any review of
// it. The event is matching again when nothing else sponsors it.
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

// The part of the sponsored event's measurement an agreement measures: the
// brand's own share of a student event (its sponsorship), or a brand's
// campaign itself, which has no sponsors. Undefined until the event has a
// measurement.
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

// How the e-contract's share is confirmed at the event: the methods as set
// here, the methods both sides last confirmed (which count, and only once
// there are such), what the venue counted for it, and, once the confirmed
// methods give this side something to record at the event (a count by hand,
// or the store's visits), its own venue page and PIN: the brand's store PIN
// on the staff page, the group's PIN on its page.
function measureView(database: Database, proposal: AcceptedProposal, side: ChatSide) {
  const share = agreementShare(database, proposal)
  if (!share) return undefined
  const { measurement, sponsor } = share
  const methods = methodsOf(measurement, sponsor)
  const confirmed = sponsor ? sponsor.confirmedMethods : measurement.confirmedMethods
  const counts = sponsor?.metrics ?? measurement.metrics
  const pin = side === "brand" ? (sponsor?.staffPin ?? measurement.staffPin) : measurement.groupPin
  const mine = activeMethodsOf(measurement, sponsor).some(
    (method) => confirmsAt(method, side) && (isVenueKind(method.kind) || method.kind === "visit"),
  )
  return {
    code: measurement.code,
    methods,
    ...(confirmed ? { confirmedMethods: confirmed } : {}),
    counts: { scans: measurement.metrics.scans, coupons: counts.coupons, visits: counts.visits, ...venueCountsOf(counts) },
    ...(mine ? { venue: { page: side === "brand" ? ("staff" as const) : ("group" as const), pin } } : {}),
  }
}

// The side an account takes in an accepted proposal, if any.
export function sideIn(proposal: AcceptedProposal, account: Account): ChatSide | undefined {
  if (proposal.group.account?.id === account.id) return "group"
  if (proposal.brand.account?.id === account.id) return "brand"
  return undefined
}

// The accepted proposals an account is in, newest answer first.
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

// What a sponsorship usually takes, to start from: the brand hands over what
// it gives and gets its coupon ready; the group promotes the event, shows
// the brand there, hands out the coupon and shares the results after.
export function defaultItems(proposal: AcceptedProposal): AgreementItem[] {
  return [
    item("brand", `협찬 전달: ${proposal.gives}`.slice(0, 80)),
    item("brand", "행사용 쿠폰과 매장 직원 안내 준비"),
    item("group", "행사 전 SNS 홍보 게시물 올리기"),
    item("group", "행사장에 브랜드 보여 주기(현수막·부스·무대 소개)"),
    item("group", "참여자에게 쿠폰 나눠 주기"),
    item("group", "행사 후 사진과 성과 리포트 공유하기"),
  ]
}

// The stored agreement, or a new one with the usual items (the caller saves).
export function agreementFor(database: Database, proposal: AcceptedProposal) {
  const stored = database.agreements.find((agreement) => agreement.id === proposal.id)
  if (stored) return { agreement: stored, created: false }
  const now = new Date().toISOString()
  const agreement: Agreement = {
    id: proposal.id,
    kind: proposal.kind,
    items: defaultItems(proposal),
    confirmed: {},
    createdAt: now,
    updatedAt: now,
  }
  database.agreements.push(agreement)
  return { agreement, created: true }
}

// An agreement with its proposal, as the side looking sees it, with the
// event (whose it is, and whether it has begun: its goals and measurement
// methods are set on the agreement until then), the goals both sides read,
// without the PINs and coupons only the owner keeps, how it is measured with
// this side's own venue PIN, the reviews (whether this side may write one
// now, its own and the other's), any request to call it off and whether this
// side may ask. A canceled one is only a record: its items and the request.
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
    // Each side's contact, which only the two sides of an accepted proposal see.
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
    review: {
      open: reviewOpen(proposal),
      canWrite: canReview(database, proposal, side),
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

// Agreements whose proposal is gone (one side left) go too; their photos'
// folders are returned for removing once the data is saved.
export function dropOrphanAgreements(database: Database) {
  const gone = database.agreements.filter((agreement) => !acceptedProposal(database, agreement.id))
  database.agreements = database.agreements.filter((agreement) => !gone.includes(agreement))
  return gone.map((agreement) => agreement.id)
}

export async function removeUploads(agreementIds: string[]) {
  await photos().removeAll(agreementIds)
}
