import { todayInKorea } from "./dates.js"
import type { Database, RequestStatus, SponsorOffer, SponsorRequest } from "../types.js"

// 제안이 다루는 행사의 마지막 날: 보낸 쪽의 행사가 아직 있으면 그 행사,
// 없으면 제안을 보낼 때 함께 보낸 날.
function lastDayOf(database: Database, proposal: SponsorRequest | SponsorOffer) {
  const request = "eventDate" in proposal
  const eventId = request ? proposal.eventId : proposal.campaignId
  const event = proposal.fromAccountId
    ? database.events[proposal.fromAccountId]?.find((item) => item.id === eventId)
    : undefined
  if (event) return event.endDate ?? event.date
  return request ? proposal.eventDate : proposal.campaignDate
}

// 행사가 끝날 때까지 답을 기다리는 제안은 마감 처리된다. 더는 답할 수 없고
// 같은 상대에게 새 제안을 보내는 것도 막지 않는다. 보낸 그대로 남겨 두므로
// 보여 주거나 답하는 곳마다 이를 계산한다.
export function statusOf(database: Database, proposal: SponsorRequest | SponsorOffer, today = todayInKorea()): RequestStatus {
  if (proposal.status !== "검토 중") return proposal.status
  const lastDay = lastDayOf(database, proposal)
  return lastDay && lastDay < today ? "마감" : "검토 중"
}
