import type { Request } from "express"
import { Router } from "express"

import { contractConfirmedAt, contractState } from "../lib/agreements.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { statusOf } from "../lib/proposals.js"
import { blockedBetween } from "../lib/safety.js"
import { recordSponsorship } from "../lib/sponsorships.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { RequestStatus } from "../types.js"

export const requestsRouter = Router()

// 받은편지함을 보여 줄 브랜드다. 로그인한 브랜드이거나, 브랜드 쪽을 미리
// 보는 방문자에게는 데모 브랜드다. 학생 계정에는 받은편지함이 없다.
export function brandOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account.role === "브랜드" ? req.account : undefined
  return database.accounts.find((account) => account.id === database.demoAccountIds.브랜드)
}

// 학생단체가 이 브랜드에 보낸 제안을 최신순으로 보여 주며, 닫힌 제안은 닫힌
// 대로 보여 준다.
requestsRouter.get("/", (req, res) => {
  const owner = brandOwner(req)
  const database = getDatabase()
  const requests = owner?.brandId
    ? database.requests
        // 어느 한쪽이 차단한 단체의 제안은 제외한다.
        .filter(
          (request) =>
            request.brandId === owner.brandId &&
            !(request.fromAccountId && blockedBetween(database, owner.id, request.fromAccountId)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((request) => {
          const status = statusOf(database, request)
          const contract =
            status === "수락"
              ? contractState(database, request.id, { group: Boolean(request.fromAccountId), brand: true })
              : undefined
          const contractAt = contract === "confirmed" ? contractConfirmedAt(database, request.id, { group: Boolean(request.fromAccountId), brand: true }) : undefined
          return { ...request, status, ...(contract ? { contract } : {}), ...(contractAt ? { contractAt } : {}) }
        })
    : []
  res.json({ requests })
})

const decisions: Record<string, RequestStatus> = { accept: "수락", decline: "거절" }

// 브랜드가 제안 하나를 수락하거나 거절한다.
requestsRouter.post("/:id/:decision", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "브랜드") throw new HttpError(403, "브랜드 회원만 제안에 답할 수 있어요.")
  // hasOwn으로 constructor처럼 모든 객체가 가진 이름은 걸러 낸다.
  if (!Object.hasOwn(decisions, req.params.decision)) throw new HttpError(404, "없는 API 경로예요.")
  const decision = decisions[req.params.decision]

  const database = getDatabase()
  const request = database.requests.find(
    (item) => item.id === req.params.id && item.brandId === account.brandId,
  )
  if (!request || (request.fromAccountId && blockedBetween(database, account.id, request.fromAccountId))) {
    throw new HttpError(404, "제안을 찾을 수 없어요.")
  }
  const status = statusOf(database, request)
  if (status === "마감") throw new HttpError(409, "행사가 끝나 마감된 제안이에요.")
  if (status !== "검토 중") throw new HttpError(409, "이미 답한 제안이에요.")
  // 제안 뒤에 삭제된 행사는 협찬할 수 없다.
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
    "proposals",
    decision === "수락" ? "협찬이 확정됐어요" : "협찬 제안에 답이 왔어요",
    [`${account.name}에서 '${request.eventName}' 제안을 ${decision === "수락" ? "수락했어요" : "거절했어요"}.`],
    "/matches",
  )
  res.json({ request })
})
