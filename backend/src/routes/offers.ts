import type { Request } from "express"
import { Router } from "express"

import { contractConfirmedAt, contractState } from "../lib/agreements.js"
import { deliveryProgress } from "../lib/progress.js"
import { HttpError } from "../lib/errors.js"
import { notify } from "../lib/notices.js"
import { statusOf } from "../lib/proposals.js"
import { blockedBetween } from "../lib/safety.js"
import { recordSponsorship } from "../lib/sponsorships.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { RequestStatus } from "../types.js"

export const offersRouter = Router()

// 받은편지함을 보여 줄 학생단체다. 로그인한 학생단체이거나, 학생 쪽을 미리
// 보는 방문자에게는 데모 단체다. 브랜드 계정에는 받은 협찬함이 없다.
function groupOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account.role === "학생단체" ? req.account : undefined
  return database.accounts.find((account) => account.id === database.demoAccountIds.학생단체)
}

// 브랜드가 이 학생단체에 보낸 제안을 최신순으로 보여 주며, 닫힌 제안은 닫힌
// 대로 보여 준다.
offersRouter.get("/", (req, res) => {
  const owner = groupOwner(req)
  const database = getDatabase()
  const offers = owner?.groupId
    ? database.offers
        // 어느 한쪽이 차단한 브랜드의 제안은 제외한다.
        .filter(
          (offer) =>
            offer.groupId === owner.groupId &&
            !(offer.fromAccountId && blockedBetween(database, owner.id, offer.fromAccountId)),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((offer) => {
          const status = statusOf(database, offer)
          const contract =
            status === "수락"
              ? contractState(database, offer.id, { group: true, brand: Boolean(offer.fromAccountId) })
              : undefined
          const contractAt = contract === "confirmed" ? contractConfirmedAt(database, offer.id, { group: true, brand: Boolean(offer.fromAccountId) }) : undefined
          // 계약 뒤의 실제 진행(행사 기록, 결과 집계 완료). 날짜가 아니라 기록으로.
          const progress = status === "수락" ? deliveryProgress(database, offer.campaignId) : {}
          return { ...offer, status, ...(contract ? { contract } : {}), ...(contractAt ? { contractAt } : {}), ...progress }
        })
    : []
  res.json({ offers })
})

const decisions: Record<string, RequestStatus> = { accept: "수락", decline: "거절" }

// 학생단체가 협찬 제안 하나를 수락하거나 거절한다.
offersRouter.post("/:id/:decision", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체 회원만 받은 협찬에 답할 수 있어요.")
  // hasOwn으로 constructor처럼 모든 객체가 가진 이름은 걸러 낸다.
  if (!Object.hasOwn(decisions, req.params.decision)) throw new HttpError(404, "없는 API 경로예요.")
  const decision = decisions[req.params.decision]

  const database = getDatabase()
  const offer = database.offers.find(
    (item) => item.id === req.params.id && item.groupId === account.groupId,
  )
  if (!offer || (offer.fromAccountId && blockedBetween(database, account.id, offer.fromAccountId))) {
    throw new HttpError(404, "제안을 찾을 수 없어요.")
  }
  const status = statusOf(database, offer)
  if (status === "마감") throw new HttpError(409, "캠페인이 끝나 마감된 제안이에요.")
  if (status !== "검토 중") throw new HttpError(409, "이미 답한 제안이에요.")
  // 제안 뒤에 삭제된 캠페인은 협찬할 수 없다.
  if (
    decision === "수락" &&
    offer.campaignId &&
    offer.fromAccountId &&
    !database.events[offer.fromAccountId]?.some((item) => item.id === offer.campaignId)
  ) {
    throw new HttpError(409, "삭제된 캠페인에 대한 제안이에요.")
  }

  offer.status = decision
  offer.respondedAt = new Date().toISOString()
  if (decision === "수락" && offer.fromAccountId) {
    const campaign = database.events[offer.fromAccountId]?.find((item) => item.id === offer.campaignId)
    if (campaign?.status === "매칭 중") campaign.status = "집행 예정"
    recordSponsorship(database, offer.fromAccountId, {
      id: `sp-${offer.id}`,
      groupName: account.name,
      eventName: offer.campaignName,
      date: offer.campaignDate,
    })
  }
  await saveDatabase()
  void notify(
    database.accounts.find((item) => item.id === offer.fromAccountId),
    "proposals",
    decision === "수락" ? "제안이 수락됐어요" : "협찬 제안에 답이 왔어요",
    [`${account.name}에서 '${offer.campaignName}' 제안을 ${decision === "수락" ? "수락했어요" : "거절했어요"}.`, ...(decision === "수락" ? ["양쪽이 임시 전자 계약서를 확인하면 협찬이 확정돼요."] : [])],
    "/groups",
  )
  res.json({ offer })
})
