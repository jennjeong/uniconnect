import { randomUUID } from "node:crypto"
import { rm } from "node:fs/promises"
import path from "node:path"

import { config } from "../config.js"
import type { Account, Agreement, AgreementItem, ChatSide, Database } from "../types.js"

// Where an agreement's photos are kept: beside the data file, one folder
// per agreement, so a test's or a demo's data keeps its own.
export const uploadsFolder = (agreementId: string) =>
  path.join(path.dirname(config.dataFile), "uploads", agreementId.replace(/[^\w-]/g, "_"))

// An accepted proposal as both sides see it: who is in it (their accounts
// when they have one), the event and what the brand gives.
export type AcceptedProposal = {
  id: string
  kind: Agreement["kind"]
  group: { name: string; account?: Account }
  brand: { name: string; account?: Account }
  eventName: string
  // "YYYY-MM-DD", or "" while there is none.
  eventDate: string
  gives: string
  respondedAt?: string
}

export function acceptedProposal(database: Database, id: string): AcceptedProposal | undefined {
  const request = database.requests.find((item) => item.id === id && item.status === "수락")
  if (request) {
    return {
      id,
      kind: "request",
      group: {
        name: request.groupName,
        account: database.accounts.find((account) => account.id === request.fromAccountId),
      },
      brand: {
        name: database.brands.find((brand) => brand.id === request.brandId)?.name ?? "",
        account: database.accounts.find((account) => account.brandId === request.brandId),
      },
      eventName: request.eventName,
      eventDate: request.eventDate,
      gives: request.ask,
      respondedAt: request.respondedAt,
    }
  }
  const offer = database.offers.find((item) => item.id === id && item.status === "수락")
  if (!offer) return undefined
  return {
    id,
    kind: "offer",
    group: {
      name: database.groups.find((group) => group.id === offer.groupId)?.name ?? "",
      account: database.accounts.find((account) => account.groupId === offer.groupId),
    },
    brand: {
      name: offer.brandName,
      account: database.accounts.find((account) => account.id === offer.fromAccountId),
    },
    eventName: offer.campaignName,
    eventDate: offer.campaignDate,
    gives: offer.offer,
    respondedAt: offer.respondedAt,
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
    ...database.requests.filter((item) => item.status === "수락").map((item) => item.id),
    ...database.offers.filter((item) => item.status === "수락").map((item) => item.id),
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

// An agreement with its proposal, as the side looking sees it.
export function agreementView(agreement: Agreement, proposal: AcceptedProposal, side: ChatSide) {
  return {
    ...agreement,
    side,
    group: { name: proposal.group.name, member: Boolean(proposal.group.account) },
    brand: { name: proposal.brand.name, member: Boolean(proposal.brand.account) },
    eventName: proposal.eventName,
    eventDate: proposal.eventDate,
    gives: proposal.gives,
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
  await Promise.all(agreementIds.map((id) => rm(uploadsFolder(id), { recursive: true, force: true })))
}
