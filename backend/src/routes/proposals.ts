import { randomUUID } from "node:crypto"
import { Router } from "express"

import { brandIndustries, groupIndustries, shownCatalog, shownTo } from "../lib/catalog.js"
import { todayInKorea } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, EventItem, RequestStatus, SponsorOffer, SponsorRequest } from "../types.js"

export const proposalsRouter = Router()

// Ids the account proposed to, with each answer so far: brands answer
// student groups' requests, groups answer brands' offers. Only partners
// with an account answer; the rest stay "sent". `confirmed` counts the
// account's sponsorships either way round: proposals it sent that were
// accepted and ones it received and accepted, each event once.
function proposalState(account: Account) {
  const database = getDatabase()
  // Proposals to listings the account no longer sees (a member's to the
  // examples, sent before they were set apart) drop out; ones to a partner
  // that left stay.
  const catalog = account.role === "학생단체" ? "brands" : "groups"
  const listings = catalog === "brands" ? database.brands : database.groups
  const proposals = (database.proposals[account.id] ?? []).filter((id) => {
    const listing = listings.find((item) => item.id === id)
    return !listing || shownTo(database, catalog, listing, account)
  })
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
  const confirmed =
    account.role === "학생단체"
      ? database.requests.filter((item) => item.fromAccountId === account.id && item.status === "수락").length +
        database.offers.filter((item) => item.groupId === account.groupId && item.status === "수락").length
      : (database.sponsorships[account.id] ?? []).length
  // What the account sent, newest first, as its inbox lists them beside what
  // it received: to whom, about which of its events, offering what, and the
  // answer so far.
  const sentList = sent
    .filter((item) => proposals.includes(item.partnerId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((item) => {
      const partner = listings.find((listing) => listing.id === item.partnerId)
      const date = "eventDate" in item ? item.eventDate : item.campaignDate
      return {
        id: item.id,
        partnerId: item.partnerId,
        partnerName: partner?.name ?? "알 수 없는 상대",
        industry: partner?.industry ?? item.industry,
        ...(partner?.logo ? { logo: partner.logo } : {}),
        ...(partner?.school ? { school: partner.school } : {}),
        eventName: "eventName" in item ? item.eventName : item.campaignName,
        ...(date ? { eventDate: date } : {}),
        offer: "ask" in item ? item.ask : item.offer,
        status: item.status,
        createdAt: item.createdAt,
        ...(item.respondedAt ? { respondedAt: item.respondedAt } : {}),
      }
    })
  return { proposals, statuses, confirmed, sent: sentList }
}

// The account's next event (a group's) or campaign (a brand's) that has
// not ended, which a proposal is about.
function nextEvent(account: Account) {
  const today = todayInKorea()
  return (getDatabase().events[account.id] ?? [])
    .filter((item) => (item.endDate ?? item.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0]
}

// A brand's offer about its next campaign, for a group with an account.
function brandOffer(account: Account, groupId: string, campaign: EventItem): SponsorOffer {
  const listing = getDatabase().brands.find((brand) => brand.id === account.brandId)
  return {
    id: randomUUID(),
    groupId,
    fromAccountId: account.id,
    campaignId: campaign.id,
    ...(listing ? { brandId: listing.id } : {}),
    brandName: account.name,
    industry: listing?.industry ?? brandIndustries[account.type] ?? "cafe",
    campaignName: campaign.name,
    campaignDate: campaign.date,
    offer: listing?.offer || "협찬 내용 협의",
    message: `${campaign.name}을 함께 열고 싶어요. 단체의 행사와 SNS에서 함께 알려 주세요.`,
    status: "검토 중",
    createdAt: new Date().toISOString(),
  }
}

// Whether a proposal can go to a partner with an account about this event:
// not while one waits for an answer (sending again changes nothing), and
// not about an event the partner already accepted. A sponsorship needs an
// event, so its results reach the brand's analytics.
function canPropose(sent: { status: RequestStatus; eventId?: string }[], event: EventItem | undefined, students: boolean) {
  if (!event) {
    throw new HttpError(
      409,
      students
        ? "협찬받을 행사를 먼저 내 행사에 등록해 주세요. 제안은 다가오는 행사로 보내져요."
        : "제안할 캠페인을 먼저 행사 일정에 등록해 주세요. 제안은 다가오는 캠페인으로 보내져요.",
    )
  }
  if (sent.some((item) => item.status === "검토 중")) return false
  if (sent.some((item) => item.status === "수락" && item.eventId === event.id)) {
    throw new HttpError(
      409,
      `${event.name}은 이미 협찬이 확정됐어요. 다음 ${students ? "행사" : "캠페인"}를 등록하면 다시 제안할 수 있어요.`,
    )
  }
  return true
}

proposalsRouter.get("/", (req, res) => {
  res.json(req.account ? proposalState(req.account) : { proposals: [], statuses: {}, confirmed: 0, sent: [] })
})

proposalsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const matchId = String(req.body?.matchId ?? "")
  const database = getDatabase()
  // Student groups propose to any brand they see, brands to any group: a
  // member to members, a demo account within the examples.
  const partner = shownCatalog(database, account.role === "학생단체" ? "brands" : "groups", account).find(
    (match) => match.id === matchId,
  )
  if (!partner) throw new HttpError(404, "목록에 없는 상대예요.")
  const students = account.role === "학생단체"
  const event = nextEvent(account)

  // A group with an account gets a brand's offer in its inbox, about the
  // brand's next campaign; a brand with an account gets a group's proposal,
  // about the group's next event. A declined one can be sent again, and an
  // accepted one again about a later event.
  const partnerHasInbox = database.accounts.some((item) =>
    students ? item.brandId === matchId : item.groupId === matchId,
  )
  const send =
    partnerHasInbox &&
    canPropose(
      students
        ? database.requests.filter((item) => item.fromAccountId === account.id && item.brandId === matchId)
        : database.offers
            .filter((item) => item.fromAccountId === account.id && item.groupId === matchId)
            .map((item) => ({ status: item.status, eventId: item.campaignId })),
      event,
      students,
    )

  const current = database.proposals[account.id] ?? []
  if (!current.includes(matchId)) database.proposals[account.id] = [...current, matchId]

  if (!students && send && event) {
    const offer = brandOffer(account, matchId, event)
    database.offers.push(offer)
    void notify(
      database.accounts.find((item) => item.groupId === matchId),
      "새 협찬 제안이 왔어요",
      [`${account.name}에서 '${offer.campaignName}' 협찬을 제안했어요.`, `제공 협찬: ${offer.offer}`],
      "/offers",
    )
  }

  if (students && send && event) {
    database.requests.push({
      id: randomUUID(),
      brandId: matchId,
      fromAccountId: account.id,
      eventId: event.id,
      groupName: account.name,
      school: account.school,
      industry: groupIndustries[account.type] ?? "performance",
      eventName: event.name,
      eventDate: event.date,
      people: event.people ? `예상 인원 ${event.people}` : "인원 협의",
      ask: partner.offer,
      message: `${event.name}에 함께해 주세요! 현장과 SNS에서 브랜드를 알릴게요.`,
      status: "검토 중",
      createdAt: new Date().toISOString(),
    })
    void notify(
      database.accounts.find((item) => item.brandId === matchId),
      "새 협찬 제안이 왔어요",
      [`${account.name}에서 '${event.name}' 협찬을 제안했어요.`],
      "/inbox",
    )
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
  // A withdrawn proposal leaves the other side's inbox; answered ones stay in
  // its history. With an accepted one, only a waiting one about a later
  // event can be withdrawn, and the partner stays among the proposals.
  const withdrawn = new Set(sent.filter((item) => item.status === "검토 중"))
  const accepted = sent.some((item) => item.status === "수락")
  if (accepted && withdrawn.size === 0) throw new HttpError(409, "이미 수락된 제안이에요.")
  database.requests = database.requests.filter((request) => !withdrawn.has(request))
  database.offers = database.offers.filter((offer) => !withdrawn.has(offer))
  if (!accepted) {
    database.proposals[account.id] = (database.proposals[account.id] ?? []).filter((id) => id !== matchId)
  }
  await saveDatabase()
  res.json(proposalState(account))
})
