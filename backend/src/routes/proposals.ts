import { randomUUID } from "node:crypto"
import { Router } from "express"

import { groupIndustries } from "../lib/catalog.js"
import { HttpError } from "../lib/errors.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { Account, RequestStatus, SponsorRequest } from "../types.js"

export const proposalsRouter = Router()

// Ids the account proposed to, with each brand's answer so far. Only brands
// with an account answer; the rest stay "sent".
function proposalState(account: Account) {
  const database = getDatabase()
  const proposals = database.proposals[account.id] ?? []
  const statuses: Record<string, RequestStatus> = {}
  const sent = database.requests
    .filter((request) => request.fromAccountId === account.id && proposals.includes(request.brandId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  // Oldest first, so a brand's newest request wins.
  for (const request of sent) statuses[request.brandId] = request.status
  return { proposals, statuses }
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
  const sentHere = (request: SponsorRequest) =>
    request.fromAccountId === account.id && request.brandId === req.params.matchId
  if (database.requests.some((request) => sentHere(request) && request.status === "수락")) {
    throw new HttpError(409, "이미 수락된 제안이에요.")
  }
  // A withdrawn proposal leaves the brand's inbox; answered ones stay in its history.
  database.requests = database.requests.filter(
    (request) => !(sentHere(request) && request.status === "검토 중"),
  )
  database.proposals[account.id] = (database.proposals[account.id] ?? []).filter(
    (matchId) => matchId !== req.params.matchId,
  )
  await saveDatabase()
  res.json(proposalState(account))
})
