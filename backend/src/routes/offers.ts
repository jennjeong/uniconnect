import type { Request } from "express"
import { Router } from "express"

import { HttpError } from "../lib/errors.js"
import { requireAccount } from "../middleware/session.js"
import { getDatabase, saveDatabase } from "../store.js"
import type { RequestStatus } from "../types.js"

export const offersRouter = Router()

// Group whose inbox to show: the logged-in student group, or the demo group
// for visitors previewing the student side. Brand accounts have no offers inbox.
function groupOwner(req: Request) {
  const database = getDatabase()
  if (req.account) return req.account.role === "학생단체" ? req.account : undefined
  return database.accounts.find((account) => account.id === database.demoAccountIds.학생단체)
}

// Proposals brands sent to this student group, newest first.
offersRouter.get("/", (req, res) => {
  const owner = groupOwner(req)
  const offers = owner?.groupId
    ? getDatabase()
        .offers.filter((offer) => offer.groupId === owner.groupId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : []
  res.json({ offers })
})

const decisions: Record<string, RequestStatus> = { accept: "수락", decline: "거절" }

// The student group accepts or declines one offer.
offersRouter.post("/:id/:decision", async (req, res) => {
  const account = requireAccount(req)
  if (account.role !== "학생단체") throw new HttpError(403, "학생단체 회원만 받은 협찬에 답할 수 있어요.")
  // hasOwn keeps names every object has, such as constructor, out.
  if (!Object.hasOwn(decisions, req.params.decision)) throw new HttpError(404, "없는 API 경로예요.")
  const decision = decisions[req.params.decision]

  const database = getDatabase()
  const offer = database.offers.find(
    (item) => item.id === req.params.id && item.groupId === account.groupId,
  )
  if (!offer) throw new HttpError(404, "제안을 찾을 수 없어요.")
  if (offer.status !== "검토 중") throw new HttpError(409, "이미 답한 제안이에요.")

  offer.status = decision
  offer.respondedAt = new Date().toISOString()
  if (decision === "수락" && offer.fromAccountId) {
    const campaign = database.events[offer.fromAccountId]?.find((item) => item.id === offer.campaignId)
    if (campaign?.status === "매칭 중") campaign.status = "집행 예정"
  }
  await saveDatabase()
  res.json({ offer })
})
