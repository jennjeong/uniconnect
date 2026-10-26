import type { Request } from "express"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { statusOf } from "../lib/proposals.js"
import { recordSponsorship } from "../lib/sponsorships.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { RequestStatus } from "../types.js"

export const requestsRouter = Router()

// Brand whose inbox to show: the logged-in brand, or the demo brand for
// visitors previewing the brand side. Student accounts have no inbox.
export function brandOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account.role === "브랜드" ? req.account : undefined
  return database.accounts.find((account) => account.id === database.demoAccountIds.브랜드)
}

// Proposals student groups sent to this brand, newest first, closed ones
// as such.
requestsRouter.get("/", (req, res) => {
  const owner = brandOwner(req)
  const database = getDatabase()
  const requests = owner?.brandId
    ? database.requests
        .filter((request) => request.brandId === owner.brandId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((request) => ({ ...request, status: statusOf(database, request) }))
    : []
  res.json({ requests })
})

const decisions: Record<string, RequestStatus> = { accept: "수락", decline: "거절" }

// The brand accepts or declines one proposal.
requestsRouter.post("/:id/:decision", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "브랜드") throw new HttpError(403, "브랜드 회원만 제안에 답할 수 있어요.")
  // hasOwn keeps names every object has, such as constructor, out.
  if (!Object.hasOwn(decisions, req.params.decision)) throw new HttpError(404, "없는 API 경로예요.")
  const decision = decisions[req.params.decision]

  const database = getDatabase()
  const request = database.requests.find(
    (item) => item.id === req.params.id && item.brandId === account.brandId,
  )
  if (!request) throw new HttpError(404, "제안을 찾을 수 없어요.")
  const status = statusOf(database, request)
  if (status === "마감") throw new HttpError(409, "행사가 끝나 마감된 제안이에요.")
  if (status !== "검토 중") throw new HttpError(409, "이미 답한 제안이에요.")
  // An event deleted since the proposal cannot be sponsored.
  if (
    decision === "수락" &&
    request.eventId &&
    request.fromAccountId &&
    !database.events[request.fromAccountId]?.some((item) => item.id === request.eventId)
  ) {
    throw new HttpError(409, "삭제된 행사에 대한 제안이에요.")
  }

  request.status = decision
  request.respondedAt = new Date().toISOString()
  if (decision === "수락" && request.fromAccountId) {
    const event = database.events[request.fromAccountId]?.find((item) => item.id === request.eventId)
    if (event?.status === "매칭 중") event.status = "집행 예정"
  }
  if (decision === "수락") {
    recordSponsorship(database, account.id, {
      id: `sp-${request.id}`,
      groupName: request.groupName,
      eventName: request.eventName,
      date: request.eventDate,
      ...(request.eventId ? { eventId: request.eventId } : {}),
    })
  }
  await saveDatabase()
  void notify(
    database.accounts.find((item) => item.id === request.fromAccountId),
    decision === "수락" ? "협찬이 확정됐어요" : "협찬 제안에 답이 왔어요",
    [`${account.name}에서 '${request.eventName}' 제안을 ${decision === "수락" ? "수락했어요" : "거절했어요"}.`],
    "/matches",
  )
  res.json({ request })
})
