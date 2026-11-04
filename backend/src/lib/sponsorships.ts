import { todayInKorea } from "./dates.js"
import { estimatedSales, shareValue, syncSponsors } from "./measurements.js"
import { venueCountsOf } from "./methods.js"
import type { Database, Sponsorship } from "../types.js"

// 수락된 제안은 브랜드의 협찬 하나가 된다. 제안이 다루는 행사가 학생 행사면
// id로 이어져, 집계, 가치, 목표가 그 행사의 측정에서 나오고 거기서 자기
// 쿠폰과 집계를 갖는다. 한 번만 만든다.
export function recordSponsorship(
  database: Database,
  brandAccountId: string,
  sponsorship: Pick<Sponsorship, "id" | "groupName" | "eventName" | "date" | "eventId">,
) {
  const list = (database.sponsorships[brandAccountId] ??= [])
  if (list.some((item) => item.id === sponsorship.id)) return
  list.push({ ...sponsorship, spend: 0, coupons: 0, visits: 0, sales: 0, targetRoas: 150 })
  const measurement = database.measurements.find((item) => item.eventId === sponsorship.eventId)
  if (sponsorship.eventId && measurement) syncSponsors(database, measurement)
}

// 측정된 행사의 협찬은 행사에서 자기 몫을 갖는다: 그 쿠폰의 쿠폰 수와 방문
// 수, 추정 매출, 행사장이 방식별로 확인한 것, 낸 가치, 단체가 정한 ROAS
// 목표. (측정이 로드될 때 모든 협찬사에게 몫을 주는데, 몫이 없으면 행사
// 자체의 수치를 쓴다.)
function withLiveFigures(database: Database, sponsorship: Sponsorship): Sponsorship {
  const measurement = database.measurements.find((item) => item.eventId === sponsorship.eventId)
  if (!measurement) return sponsorship
  const sponsor = measurement.sponsors.find((item) => item.id === sponsorship.id)
  if (sponsor) {
    return {
      ...sponsorship,
      spend: shareValue(measurement, sponsor) || sponsorship.spend,
      coupons: sponsor.metrics.coupons,
      visits: sponsor.metrics.visits,
      sales: sponsor.metrics.visits * measurement.goals.averageSpend,
      ...venueCountsOf(sponsor.metrics),
      targetRoas: measurement.goals.targets.roas,
    }
  }
  const value = measurement.goals.valueBreakdown.reduce((sum, part) => sum + part.value, 0)
  return {
    ...sponsorship,
    spend: value || sponsorship.spend,
    coupons: measurement.metrics.coupons,
    visits: measurement.metrics.visits,
    sales: estimatedSales(measurement),
    ...venueCountsOf(measurement.metrics),
    targetRoas: measurement.goals.targets.roas,
  }
}

// 날이 된 브랜드의 협찬. 새것부터 두고 측정된 것은 실시간 수치를 붙인다.
export function finishedSponsorships(database: Database, brandAccountId: string) {
  const today = todayInKorea()
  return (database.sponsorships[brandAccountId] ?? [])
    .filter((sponsorship) => sponsorship.date && sponsorship.date <= today)
    .map((sponsorship) => withLiveFigures(database, sponsorship))
    .sort((a, b) => b.date.localeCompare(a.date))
}

// 이 행사들의 측정이 사라지기 전(그 단체가 탈퇴한다), 거기에 딸린 협찬은
// 그때의 수치를 그대로 지녀 협찬사의 이력이 남는다.
export function freezeSponsorships(database: Database, eventIds: Set<string>) {
  for (const [brandAccountId, list] of Object.entries(database.sponsorships)) {
    database.sponsorships[brandAccountId] = list.map((sponsorship) => {
      if (!sponsorship.eventId || !eventIds.has(sponsorship.eventId)) return sponsorship
      const { eventId: _, ...frozen } = withLiveFigures(database, sponsorship)
      return frozen
    })
  }
}

// 협찬사가 이 행사에 기대고 있는지: 그 행사에 대한 수락된 제안이나 기록된
// 협찬이 있다.
export function isSponsored(database: Database, eventId: string) {
  return (
    database.requests.some((request) => request.eventId === eventId && request.status === "수락") ||
    database.offers.some((offer) => offer.campaignId === eventId && offer.status === "수락") ||
    Object.values(database.sponsorships).some((list) => list.some((item) => item.eventId === eventId))
  )
}
