import { todayInKorea } from "./dates.js"
import type { Database, RequestStatus, SponsorOffer, SponsorRequest } from "../types.js"

// The last day of the event a proposal is about: the sender's event while
// it is there, else the day the proposal was sent with.
function lastDayOf(database: Database, proposal: SponsorRequest | SponsorOffer) {
  const request = "eventDate" in proposal
  const eventId = request ? proposal.eventId : proposal.campaignId
  const event = proposal.fromAccountId
    ? database.events[proposal.fromAccountId]?.find((item) => item.id === eventId)
    : undefined
  if (event) return event.endDate ?? event.date
  return request ? proposal.eventDate : proposal.campaignDate
}

// A proposal still waiting for an answer once its event has ended is
// closed (마감): it can't be answered any more, and it doesn't hold back a
// new proposal to the same partner. It is kept as it was sent, so this is
// worked out wherever it is shown or answered.
export function statusOf(database: Database, proposal: SponsorRequest | SponsorOffer, today = todayInKorea()): RequestStatus {
  if (proposal.status !== "검토 중") return proposal.status
  const lastDay = lastDayOf(database, proposal)
  return lastDay && lastDay < today ? "마감" : "검토 중"
}
