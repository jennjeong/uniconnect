import { randomUUID } from "node:crypto"
import { Router } from "express"

import { industryOf, ownerOf, partnerCatalogOf, shownCatalog, shownTo } from "../lib/catalog.js"
import { todayInKorea } from "../lib/dates.js"
import { HttpError } from "../lib/errors.js"
import { contractState, openTasksOf } from "../lib/agreements.js"
import { parseTerms, termLines } from "../lib/terms.js"
import { text } from "../lib/validation.js"
import { notify } from "../lib/notices.js"
import { createRateLimit, senderKey } from "../lib/rateLimit.js"
import { statusOf } from "../lib/proposals.js"
import { assertCanOffer } from "../lib/pro.js"
import { isOpen } from "./board.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, EventItem, RequestStatus, SponsorOffer, SponsorRequest } from "../types.js"

export const proposalsRouter = Router()

// 계정이 제안한 id와 지금까지의 답을 보여 준다. 브랜드는 학생단체의 요청에,
// 단체는 브랜드의 제안에 답한다. 계정이 있는 파트너만 답하고, 나머지는 "sent"로
// 남는다. `confirmed`는 방향에 상관없이 계정의 협찬을 센다. 보낸 제안 중 수락된
// 것과 받아서 수락한 것을, 행사마다 한 번씩 센다.
function proposalState(account: Account) {
  const database = getDatabase()
  // 계정이 더 이상 볼 수 없는 리스팅에 보낸 제안(예시를 분리하기 전에 회원이
  // 예시에 보낸 것)은 빠지고, 떠난 파트너에게 보낸 제안은 남는다.
  const catalog = partnerCatalogOf(account.role)
  const listings = database[catalog]
  const proposals = (database.proposals[account.id] ?? []).filter((id) => {
    const listing = listings.find((item) => item.id === id)
    return !listing || shownTo(database, catalog, listing, account)
  })
  const statuses: Record<string, RequestStatus> = {}
  const sent =
    account.role === "학생단체"
      ? database.requests
          .filter((request) => request.fromAccountId === account.id)
          .map((request) => ({ partnerId: request.brandId, ...request, status: statusOf(database, request) }))
      : database.offers
          .filter((offer) => offer.fromAccountId === account.id)
          .map((offer) => ({ partnerId: offer.groupId, ...offer, status: statusOf(database, offer) }))
  // 오래된 것부터 읽어서 파트너의 가장 최근 답이 이기게 한다.
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
  // 계정이 보낸 것을 최신순으로 보여 주며, 받은 것과 함께 받은편지함에
  // 나열한다. 누구에게, 자기 어느 행사에 대해, 무엇을 제안했는지와 지금까지의
  // 답을 담는다.
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
        message: item.message,
        ...(item.terms ? { terms: item.terms } : {}),
        status: item.status,
        // 수락된 것은 계약서까지 왔는지(대시보드의 '계약 확인 대기'가 센다).
        ...(item.status === "수락"
          ? {
              contract: contractState(
                database,
                item.id,
                account.role === "학생단체"
                  ? { group: true, brand: Boolean(ownerOf(database, "brands", item.partnerId)) }
                  : { group: Boolean(ownerOf(database, "groups", item.partnerId)), brand: true },
              ),
            }
          : {}),
        createdAt: item.createdAt,
        ...(item.respondedAt ? { respondedAt: item.respondedAt } : {}),
      }
    })
  // 받은편지함이 없는 상대(아직 가입하지 않은 예시 리스팅이나, 기록이 생기기 전에
  // 보낸 제안)에게 보낸 것도 보낸 제안에 넣는다. 카드의 '제안 완료', 보낸 제안함,
  // 대시보드의 건수가 같은 목록을 읽게 한다. 답이 오지 않으므로 그렇게 표시한다.
  const recorded = new Set(sent.map((item) => item.partnerId))
  const nextEvent = (database.events[account.id] ?? [])
    .filter((item) => (item.endDate ?? item.date) >= todayInKorea())
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const ownListing =
    account.role === "브랜드" ? database.brands.find((brand) => brand.id === account.brandId) : undefined
  const unanswerable = proposals
    .filter((id) => !recorded.has(id))
    .map((partnerId) => {
      // 답할 수 없는 상대이므로 statuses에는 넣지 않는다(카드에 보여 줄 답이 없다).
      const partner = listings.find((listing) => listing.id === partnerId)
      return {
        id: `listing-${partnerId}`,
        partnerId,
        partnerName: partner?.name ?? "알 수 없는 상대",
        industry: partner?.industry ?? "cafe",
        ...(partner?.logo ? { logo: partner.logo } : {}),
        ...(partner?.school ? { school: partner.school } : {}),
        eventName: nextEvent?.name ?? "다가오는 행사",
        ...(nextEvent ? { eventDate: nextEvent.date } : {}),
        offer: (account.role === "학생단체" ? partner?.offer : ownListing?.offer) || "협찬 내용 협의",
        status: "검토 중" as RequestStatus,
        createdAt: account.createdAt,
        noInbox: true,
      }
    })
  return { proposals, statuses, confirmed, sent: [...sentList, ...unanswerable], openTasks: openTasksOf(database, account) }
}

// 제안이 파트너에게 전하는 메모의 최대 길이다.
const maxMessage = 300

// 제안이 다루는 계정의 행사(단체의 경우)나 캠페인(브랜드의 경우)이다. 고른
// 것이 끝나지 않았으면 그것이고, 아니면 다음 것이다.
function proposedEvent(account: Account, eventId: string) {
  const today = todayInKorea()
  const events = getDatabase().events[account.id] ?? []
  if (!eventId) {
    return events
      .filter((item) => (item.endDate ?? item.date) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]
  }
  const students = account.role === "학생단체"
  const picked = events.find((item) => item.id === eventId)
  if (!picked) throw new HttpError(404, students ? "제안할 행사를 찾을 수 없어요." : "제안할 캠페인을 찾을 수 없어요.")
  if ((picked.endDate ?? picked.date) < today) {
    throw new HttpError(409, students ? "끝난 행사로는 제안할 수 없어요." : "끝난 캠페인으로는 제안할 수 없어요.")
  }
  return picked
}

// 계정이 있는 단체에 보내는, 브랜드의 캠페인에 대한 제안이다. 브랜드의 메모나
// 기본 문구를 담는다.
function brandOffer(account: Account, groupId: string, campaign: EventItem, note: string): SponsorOffer {
  const listing = getDatabase().brands.find((brand) => brand.id === account.brandId)
  return {
    id: randomUUID(),
    groupId,
    fromAccountId: account.id,
    campaignId: campaign.id,
    ...(listing ? { brandId: listing.id } : {}),
    brandName: account.name,
    industry: listing?.industry ?? industryOf(account),
    campaignName: campaign.name,
    campaignDate: campaign.date,
    offer: listing?.offer || "협찬 내용 협의",
    message: note || `${campaign.name}을 함께 열고 싶어요. 단체의 행사와 SNS에서 함께 알려 주세요.`,
    status: "검토 중",
    createdAt: new Date().toISOString(),
  }
}

// 계정이 있는 파트너에게 이 행사에 대해 제안을 보낼 수 있는지 정한다. 답을
// 기다리는 제안이 있는 동안(다시 보내도 달라지는 것이 없고, 행사가 끝난
// 제안은 닫혔으므로 세지 않는다)은 안 되고, 파트너가 이미 수락한 행사에 대해서도
// 안 된다. 협찬에는 행사가 필요하므로, 그 결과가 브랜드의 분석에 닿는다.
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
      `${event.name}은 이미 수락된 제안이 있어요. 다음 ${students ? "행사" : "캠페인"}를 등록하면 다시 제안할 수 있어요.`,
    )
  }
  return true
}

proposalsRouter.get("/", (req, res) => {
  res.json(req.account ? proposalState(req.account) : { proposals: [], statuses: {}, confirmed: 0, sent: [], openTasks: { tasks: 0, agreements: 0, toConfirm: 0, awaitingPartner: 0 } })
})

// 단체나 브랜드가 한 시간에 제안하는 수보다 많은 수다. 제안마다 파트너에게 메일이 간다.
const proposalsPerHour = createRateLimit({
  label: "협찬 제안 발송",
  limit: 30,
  windowMs: 60 * 60 * 1000,
  message: "제안을 너무 많이 보냈어요. 1시간 뒤에 다시 보내 주세요.",
})

proposalsRouter.post("/", async (req, res) => {
  const account = requireAccount(req)
  const matchId = String(req.body?.matchId ?? "")
  const database = getDatabase()
  // 학생단체는 자기가 보는 모든 브랜드에, 브랜드는 모든 단체에 제안한다.
  // 회원은 회원에게, 데모 계정은 예시 안에서만이다.
  const partner = shownCatalog(database, partnerCatalogOf(account.role), account).find(
    (match) => match.id === matchId,
  )
  if (!partner) throw new HttpError(404, "목록에 없는 상대예요.")
  if (partner.pausedAt) throw new HttpError(409, "지금은 제안을 받지 않는 상대예요.")
  // 파트너의 게시판 글(routes/board.ts)이 열려 있는 동안 거기에 지원한다.
  const postId = text(req.body?.postId)
  const post = postId ? database.posts.find((item) => item.id === postId) : undefined
  if (postId && (!post || post.listingId !== matchId || !isOpen(post))) {
    throw new HttpError(409, "마감됐거나 찾을 수 없는 모집 글이에요.")
  }
  const students = account.role === "학생단체"
  const note = text(req.body?.message)
  if (note.length > maxMessage) throw new HttpError(400, `메시지는 ${maxMessage}자 이하로 적어 주세요.`)
  const event = proposedEvent(account, text(req.body?.eventId))
  // 조건은 메시지와 따로(금액, 수량, 기한, 혜택, 일정 조정). 없으면 예전처럼 메시지만.
  const terms = parseTerms(req.body?.terms, event)
  assertCanOffer(database, account)
  await proposalsPerHour.take(senderKey(req, database, account))

  // 계정이 있는 단체는 브랜드의 다음 캠페인에 대한 제안을 받은편지함에 받고,
  // 계정이 있는 브랜드는 단체의 다음 행사에 대한 제안을 받는다. 거절된 것은
  // 다시 보낼 수 있고, 수락된 것은 더 나중 행사에 대해서만 다시 보낼 수 있다.
  const partnerHasInbox = database.accounts.some((item) =>
    students ? item.brandId === matchId : item.groupId === matchId,
  )
  const send =
    partnerHasInbox &&
    canPropose(
      students
        ? database.requests
            .filter((item) => item.fromAccountId === account.id && item.brandId === matchId)
            .map((item) => ({ status: statusOf(database, item), eventId: item.eventId }))
        : database.offers
            .filter((item) => item.fromAccountId === account.id && item.groupId === matchId)
            .map((item) => ({ status: statusOf(database, item), eventId: item.campaignId })),
      event,
      students,
    )

  // 지원은 이미 대기 중인 것에 합쳐지지 않고 따로 도착해야 한다.
  if (post && !send) throw new HttpError(409, "이 상대에게 보낸 제안이 이미 있어요. 받은 제안 · 보낸 제안에서 확인해 주세요.")
  const applying = post ? { postId: post.id } : {}
  const postLine = post ? [`모집 글: ${post.title}`] : []

  const current = database.proposals[account.id] ?? []
  if (!current.includes(matchId)) database.proposals[account.id] = [...current, matchId]

  if (!students && send && event) {
    const offer = { ...brandOffer(account, matchId, event, note), ...applying, ...(terms ? { terms } : {}) }
    database.offers.push(offer)
    void notify(
      ownerOf(database, "groups", matchId),
      "proposals",
      "새 협찬 제안이 왔어요",
      [
        `${account.name}에서 '${offer.campaignName}' 협찬을 제안했어요.`,
        `제공 협찬: ${offer.offer}`,
        ...termLines(terms),
        ...postLine,
        ...(note ? [`메시지: ${note}`] : []),
      ],
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
      industry: industryOf(account),
      eventName: event.name,
      eventDate: event.date,
      people: event.people ? `예상 인원 ${event.people}` : "인원 협의",
      ask: partner.offer,
      message: note || `${event.name}에 함께해 주세요! 현장과 SNS에서 브랜드를 알릴게요.`,
      ...applying,
      ...(terms ? { terms } : {}),
      status: "검토 중",
      createdAt: new Date().toISOString(),
    })
    void notify(
      ownerOf(database, "brands", matchId),
      "proposals",
      "새 협찬 제안이 왔어요",
      [`${account.name}에서 '${event.name}' 협찬을 제안했어요.`, ...termLines(terms), ...postLine, ...(note ? [`메시지: ${note}`] : [])],
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
  // 철회한 제안은 상대편의 받은편지함에서 사라지고, 답한 제안은 이력에
  // 남는다. 수락된 제안은 더 나중 행사에 대해 기다리는 것만 철회할 수 있고,
  // 파트너는 제안 목록에 남는다.
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
