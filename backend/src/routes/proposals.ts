import { randomUUID } from "node:crypto"
import { Router } from "express"

import { brandIndustries, groupIndustries } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, RequestStatus, SponsorOffer, SponsorRequest } from "../types.js"

export const proposalsRouter = Router()

// Ids the account proposed to, with each answer so far: brands answer
// student groups' requests, groups answer brands' offers. Only partners
// with an account answer; the rest stay "sent".
function proposalState(account: Account) {
  const database = getDatabase()
  const proposals = database.proposals[account.id] ?? []
  const statuses: Record<string, RequestStatus> = {}
  const sent =
    account.role === "학생단체"
      ? database.requests
          .filter((request) => request.fromAccountId === account.id)
          .map((request) => ({ partnerId: request.brandId, ...request }))
      : database.offers
          .filter((offer) => offer.fromAccountId === account.id)
          .map((offer) => ({ partnerId: offer.groupId, ...offer }))
  // Oldest first, so a partner's newest answer wins.
  for (const item of sent
    .filter((item) => proposals.includes(item.partnerId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    statuses[item.partnerId] = item.status
  }
  return { proposals, statuses }
}

// A brand's offer about its next campaign, for a group with an account.
function brandOffer(account: Account, groupId: string): SponsorOffer {
  const database = getDatabase()
  const today = new Date().toISOString().slice(0, 10)
  const campaign = (database.events[account.id] ?? [])
    .filter((item) => (item.endDate ?? item.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const listing = database.brands.find((brand) => brand.id === account.brandId)
  return {
    id: randomUUID(),
    groupId,
    fromAccountId: account.id,
    ...(campaign ? { campaignId: campaign.id } : {}),
    ...(listing ? { brandId: listing.id } : {}),
    brandName: account.name,
    industry: listing?.industry ?? brandIndustries[account.type] ?? "cafe",
    campaignName: campaign?.name ?? "캠페인 일정 협의",
    campaignDate: campaign?.date ?? "",
    offer: listing?.offer || "협찬 내용 협의",
    message: campaign
      ? `${campaign.name}을 함께 열고 싶어요. 단체의 행사와 SNS에서 함께 알려 주세요.`
      : "함께할 캠페인을 같이 기획하고 싶어요.",
    status: "검토 중",
    createdAt: new Date().toISOString(),
  }
}

proposalsRouter.get("/", (req, res) => {
  res.json(req.account ? proposalState(req.account) : { proposals: [], statuses: {} })
})

proposalsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const matchId = String(req.body?.matchId ?? "")
  const database = getDatabase()
  // Student groups propose to any brand in the catalog, brands to any group.
  const partners = account.role === "학생단체" ? database.brands : database.groups
  const partner = partners.find((match) => match.id === matchId)
  if (!partner) throw new HttpError(404, "목록에 없는 상대예요.")

  const current = database.proposals[account.id] ?? []
  if (!current.includes(matchId)) database.proposals[account.id] = [...current, matchId]

  // A group with an account gets a brand's offer in its inbox, about the
  // brand's next campaign. A declined offer can be sent again.
  if (account.role === "브랜드") {
    const groupHasInbox = database.accounts.some((item) => item.groupId === matchId)
    const openOffer = database.offers.some(
      (offer) => offer.fromAccountId === account.id && offer.groupId === matchId && offer.status !== "거절",
    )
    if (groupHasInbox && !openOffer) database.offers.push(brandOffer(account, matchId))
  }

  // A brand with an account gets the proposal in its inbox, about the
  // group's next event. A declined proposal can be sent again.
  const hasInbox = database.accounts.some((item) => item.brandId === matchId)
  const open = database.requests.some(
    (request) =>
      request.fromAccountId === account.id &&
      request.brandId === matchId &&
      request.status !== "거절",
  )
  if (account.role === "학생단체" && hasInbox && !open) {
    const today = new Date().toISOString().slice(0, 10)
    const event = (database.events[account.id] ?? [])
      .filter((item) => (item.endDate ?? item.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
    database.requests.push({
      id: randomUUID(),
      brandId: matchId,
      fromAccountId: account.id,
      ...(event ? { eventId: event.id } : {}),
      groupName: account.name,
      school: account.school,
      industry: groupIndustries[account.type] ?? "performance",
      eventName: event?.name ?? "행사 일정 협의",
      eventDate: event?.date ?? "",
      people: event?.people ? `예상 인원 ${event.people}` : "인원 협의",
      ask: partner.offer,
      message: event
        ? `${event.name}에 함께해 주세요! 현장과 SNS에서 브랜드를 알릴게요.`
        : "함께할 행사를 같이 기획하고 싶어요.",
      status: "검토 중",
      createdAt: new Date().toISOString(),
    })
  }
  await saveDatabase()
  res.status(201).json(proposalState(account))
})

proposalsRouter.delete("/:matchId", async (req, res) => {
  const account = requireAccount(req)
  const database = getDatabase()
  const matchId = req.params.matchId
  const sent: (SponsorRequest | SponsorOffer)[] =
    account.role === "학생단체"
      ? database.requests.filter((request) => request.fromAccountId === account.id && request.brandId === matchId)
      : database.offers.filter((offer) => offer.fromAccountId === account.id && offer.groupId === matchId)
  if (sent.some((item) => item.status === "수락")) throw new HttpError(409, "이미 수락된 제안이에요.")
  // A withdrawn proposal leaves the other side's inbox; answered ones stay in its history.
  const withdrawn = new Set(sent.filter((item) => item.status === "검토 중"))
  database.requests = database.requests.filter((request) => !withdrawn.has(request))
  database.offers = database.offers.filter((offer) => !withdrawn.has(offer))
  database.proposals[account.id] = (database.proposals[account.id] ?? []).filter((id) => id !== matchId)
  await saveDatabase()
  res.json(proposalState(account))
})
