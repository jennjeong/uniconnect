import { upcomingEvents } from "./date"
import type { EventItem, SentProposal, SponsorRequest } from "../types"

// 브랜드가 참여한 협찬 한 건의 일정. 받은 제안(단체의 행사)과 브랜드가 먼저 보낸
// 제안(브랜드의 캠페인)을 같은 모양으로 맞춘다.
export type BrandScheduleItem = {
  id: string
  partner: string
  eventName: string
  date: string
  endDate?: string
  // 받은 제안이면 "received", 브랜드가 보낸 제안이면 "sent".
  from: "received" | "sent"
}

// 수락됐고(취소·거절·마감이 아님) 양쪽이 계약서를 확인했는지에 따라 나눈다.
const accepted = (item: { status: string }) => item.status === "수락"

function itemsOf(
  requests: SponsorRequest[],
  sent: SentProposal[],
  campaigns: EventItem[],
  contract: "confirmed" | "waiting",
): BrandScheduleItem[] {
  const seen = new Set<string>()
  const items: BrandScheduleItem[] = []
  const add = (item: BrandScheduleItem) => {
    if (seen.has(item.id)) return
    seen.add(item.id)
    items.push(item)
  }
  for (const request of requests) {
    if (!accepted(request) || (request.contract ?? "waiting") !== contract) continue
    add({ id: request.id, partner: request.groupName, eventName: request.eventName, date: request.eventDate, from: "received" })
  }
  for (const proposal of sent) {
    if (!accepted(proposal) || proposal.noInbox || (proposal.contract ?? "waiting") !== contract) continue
    const date = proposal.eventDate ?? ""
    // 보낸 제안은 브랜드 자신의 캠페인에 관한 것이다. 기간 캠페인이면 마지막 날까지.
    const campaign = campaigns.find((item) => item.name === proposal.eventName && item.date === date)
    add({
      id: proposal.id,
      partner: proposal.partnerName,
      eventName: proposal.eventName,
      date,
      ...(campaign?.endDate ? { endDate: campaign.endDate } : {}),
      from: "sent",
    })
  }
  return items
}

// 다가오는 확정 협찬: 양쪽이 계약서를 확인했고 아직 끝나지 않은 것, 가까운 순.
// 건수와 가장 가까운 일정이 같은 목록에서 나온다.
export function upcomingSponsorships(
  requests: SponsorRequest[],
  sent: SentProposal[],
  campaigns: EventItem[] = [],
  today?: string,
) {
  return upcomingEvents(itemsOf(requests, sent, campaigns, "confirmed"), today)
}

// 수락됐지만 계약서 확인이 남은 다가오는 협찬. 확정 일정에는 넣지 않고 계약 대기로 안내한다.
export function upcomingAwaitingContract(
  requests: SponsorRequest[],
  sent: SentProposal[],
  campaigns: EventItem[] = [],
  today?: string,
) {
  return upcomingEvents(itemsOf(requests, sent, campaigns, "waiting"), today)
}
