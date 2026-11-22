import type { Database, Measurement, Program } from "../types.js"
import { paymentsOf } from "./billing.js"
import { estimatedSales } from "./measurements.js"
import { venueCountsOf } from "./methods.js"
import { programSchools } from "./programs.js"

// 캠퍼스 캠페인의 통합 보고(#403): 수락된 학교마다 계약서의 이행과 증빙, 그리고 그
// 제안이 다룬 브랜드 캠페인의 측정(QR 스캔, 쿠폰, 방문, 추정 매출, 현장 확인)을 모으고,
// 캠페인 비용(운영비 + 실비)을 방문으로 나눈다. 모두 그때그때 계산하며 저장하지 않는다.
// 브랜드 캠페인의 측정은 단체마다 나뉘지 않으므로, 여러 학교가 같은 캠페인으로 묶였으면
// 그 수치는 함께 집계한 것으로 표시하고 합계에는 한 번만 더한다.

const counted = ["수락", "계약 확인", "행사 완료"] as const

type Figures = { scans: number; coupons: number; visits: number; sales: number; venue: number }

const none: Figures = { scans: 0, coupons: 0, visits: 0, sales: 0, venue: 0 }

const figuresOf = (measurement: Measurement | undefined): Figures =>
  measurement
    ? {
        scans: measurement.metrics.scans,
        coupons: measurement.metrics.coupons,
        visits: measurement.metrics.visits,
        sales: estimatedSales(measurement),
        venue: Object.values(venueCountsOf(measurement.metrics)).reduce((sum, value) => sum + value, 0),
      }
    : none

export function programReport(database: Database, program: Program) {
  const all = programSchools(database, program)
  const schools = all.filter((school) => (counted as readonly string[]).includes(school.state))
  const offers = schools.map((school) => database.offers.find((item) => item.id === school.offerId)!)
  const measurementOf = (campaignId: string | undefined) =>
    campaignId ? database.measurements.find((item) => item.accountId === program.accountId && item.eventId === campaignId) : undefined
  const rows = schools.map((school, index) => {
    const offer = offers[index]
    const items = database.agreements.find((item) => item.id === offer.id)?.items.filter((item) => item.side === "group") ?? []
    return {
      groupId: school.groupId,
      name: school.name,
      school: school.school,
      campaignId: offer.campaignId ?? "",
      eventName: offer.campaignName,
      date: offer.campaignDate,
      state: school.state,
      // 단체가 맡은 계약서 항목과 그중 마친 것, 붙인 링크와 사진의 수다.
      itemsDone: items.filter((item) => item.doneAt).length,
      itemsTotal: items.length,
      proofs: items.reduce((sum, item) => sum + item.links.length + item.photos.length, 0),
      // 같은 캠페인으로 묶인 학교의 수다. 1보다 크면 아래 수치는 그 학교들이 함께 낸 것이다.
      sharedWith: offers.filter((item) => item.campaignId === offer.campaignId).length,
      ...figuresOf(measurementOf(offer.campaignId)),
    }
  })
  const campaigns = [...new Set(offers.map((offer) => offer.campaignId).filter(Boolean))]
  const measured = campaigns.map((id) => figuresOf(measurementOf(id)))
  const total = (key: keyof Figures) => measured.reduce((sum, item) => sum + item[key], 0)
  // 캠페인 비용: 낸 운영비(부가세 전)와 견적의 실비다. 환불된 운영비는 세지 않는다.
  const paid = paymentsOf(database).some((payment) => payment.id === program.paymentId && payment.status === "paid")
  const cost = program.quote ? (paid ? program.quote.fee : 0) + program.quote.costs.reduce((sum, item) => sum + item.amount, 0) : 0
  const visits = total("visits")
  return {
    schools: rows,
    totals: {
      sent: all.filter((school) => school.state !== "후보").length,
      accepted: rows.length,
      confirmed: rows.filter((row) => row.state !== "수락").length,
      finished: rows.filter((row) => row.state === "행사 완료").length,
      itemsDone: rows.reduce((sum, row) => sum + row.itemsDone, 0),
      itemsTotal: rows.reduce((sum, row) => sum + row.itemsTotal, 0),
      proofs: rows.reduce((sum, row) => sum + row.proofs, 0),
      scans: total("scans"),
      coupons: total("coupons"),
      visits,
      sales: total("sales"),
      venue: total("venue"),
      cost,
      costPerVisit: visits > 0 && cost > 0 ? Math.round(cost / visits) : null,
    },
  }
}
