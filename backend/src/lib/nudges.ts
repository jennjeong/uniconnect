import { recipientOf } from "./adminInsights.js"
import { todayInKorea } from "./dates.js"
import { notify } from "./notices.js"
import { statusOf } from "./proposals.js"
import { blockedBetween } from "./safety.js"
import { getDatabase, retryConflicts, saveDatabase } from "../store.js"
import type { Account, Database, SponsorOffer, SponsorRequest } from "../types.js"

// 답이 없는 제안을 받은 쪽에 다시 알리는 날(보낸 날로부터)이다(#339). 제안마다 두 번까지다.
export const nudgeDays = [3, 7] as const

// 한 메일에 이름을 적는 제안 수. 나머지는 건수만 적는다.
const listedInMail = 5

type Proposal = SponsorRequest | SponsorOffer

const dayMs = 24 * 60 * 60 * 1000

// 한국 날짜로 보낸 날부터 오늘까지 지난 날 수.
const daysSince = (createdAt: string, today: string) =>
  Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${todayInKorea(new Date(createdAt))}T00:00:00Z`)) / dayMs)

// 지금 닿은 단계: 0(아직), 1(3일), 2(7일). 크론이 며칠 멈췄다가 7일이 지나서야 돌면
// 바로 2단계가 되어 한 번만 보낸다. 같은 제안에 두 번을 넘지 않는다.
const stageOf = (days: number) => nudgeDays.filter((day) => days >= day).length

const eventOf = (proposal: Proposal) => ("eventName" in proposal ? proposal.eventName : proposal.campaignName)

// 아직 답할 수 있고, 양쪽이 실제 회원이며, 서로 막지 않았고, 보낸 쪽이 적은 응답 기한이
// 지나지 않은 제안. 데모 계정과 정지된 계정에는 보내지 않는다.
function dueNudges(database: Database, today: string) {
  const demo = new Set(Object.values(database.demoAccountIds))
  const due: { proposal: Proposal; to: Account; from: Account; days: number; stage: number }[] = []
  for (const proposal of [...database.requests, ...database.offers] as Proposal[]) {
    if (statusOf(database, proposal, today) !== "검토 중") continue
    const from = database.accounts.find((account) => account.id === proposal.fromAccountId)
    const to = recipientOf(database, proposal)
    if (!from || !to || demo.has(to.id) || demo.has(from.id) || to.suspendedAt || from.suspendedAt) continue
    if (blockedBetween(database, from.id, to.id)) continue
    if (proposal.terms?.respondBy && proposal.terms.respondBy < today) continue
    const days = daysSince(proposal.createdAt, today)
    const stage = stageOf(days)
    if (stage > (proposal.nudgeStage ?? 0)) due.push({ proposal, to, from, days, stage })
  }
  return due
}

// 받은 쪽마다 한 통에 묶는다. 같은 제목의 메일은 한 시간에 5통까지라(lib/notices.ts)
// 제안마다 따로 보내면 많이 받은 회원에게 일부가 가지 않는다.
function mailLines(items: ReturnType<typeof dueNudges>) {
  const lines = [`답을 기다리는 협찬 제안이 ${items.length}건 있어요.`]
  for (const { proposal, from, days } of items.slice(0, listedInMail)) {
    const deadline = proposal.terms?.respondBy
    lines.push(
      deadline
        ? `${from.name}의 '${eventOf(proposal)}' 제안: ${days}일째 기다리고 있어요. 응답 기한은 ${deadline}예요.`
        : `${from.name}의 '${eventOf(proposal)}' 제안: ${days}일째 기다리고 있어요.`,
    )
  }
  if (items.length > listedInMail) lines.push(`그 밖에 ${items.length - listedInMail}건이 더 있어요.`)
  lines.push("수락하거나 거절해 주시면 상대가 다음 준비를 할 수 있어요.")
  return lines
}

// 보낸 지 3일, 7일이 지나도록 답이 없는 제안을 받은 쪽에 알린다. 제안 메일과 같은 종류
// ("proposals")라 받는 쪽이 끄면 가지 않는다. 보낸 뒤에 표시하므로 실패한 메일은 다음
// 실행에서 다시 간다. 크론(routes/cron.ts)과 오래 떠 있는 서버(index.ts)가 부른다.
export async function sendProposalNudges(database: Database = getDatabase(), now = new Date()) {
  const today = todayInKorea(now)
  const stamp = now.toISOString()
  const byRecipient = new Map<string, ReturnType<typeof dueNudges>>()
  for (const item of dueNudges(database, today)) byRecipient.set(item.to.id, [...(byRecipient.get(item.to.id) ?? []), item])
  let sent = 0
  for (const items of byRecipient.values()) {
    const to = items[0].to
    // 오래 기다린 것부터 적는다.
    items.sort((a, b) => a.proposal.createdAt.localeCompare(b.proposal.createdAt))
    const delivered = await notify(to, "proposals", "답을 기다리는 협찬 제안이 있어요", mailLines(items), to.role === "브랜드" ? "/inbox" : "/offers")
    if (!delivered) continue
    sent += 1
    // 보내는 동안 데이터를 새로 읽었을 수 있어 다시 찾는다.
    await retryConflicts(async () => {
      const current = getDatabase()
      for (const { proposal, stage } of items) {
        const stored = [...current.requests, ...current.offers].find((item) => item.id === proposal.id)
        if (!stored || (stored.nudgeStage ?? 0) >= stage) continue
        stored.nudgeStage = stage as 1 | 2
        stored.nudgedAt = stamp
      }
      await saveDatabase()
    })
  }
  return sent
}
