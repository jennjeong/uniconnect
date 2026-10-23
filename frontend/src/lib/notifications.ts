import type { IconName } from "../components/Icon"
import type {
  Match,
  NavLabel,
  Report,
  RequestStatus,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
} from "../types"
import { t } from "../i18n"
import { roasText } from "./kpis"
import { measureState } from "./measurements"
import { roasOf } from "./sponsorships"

export type NotificationItem = {
  key: string
  icon: IconName
  // Green marks good news, such as a confirmed sponsorship.
  good?: boolean
  title: string
  caption: string
  // Page that has the details.
  target: NavLabel
}

// "노원 크리에이터스, 광운대 무브먼트 외 1곳"
function nameList(names: string[]) {
  const shown = names.slice(0, 2).join(", ")
  return names.length > 2 ? t("{names} 외 {count}곳", { names: shown, count: names.length - 2 }) : shown
}

export function studentNotifications({
  matches,
  brands,
  statuses,
  report,
  offers,
}: {
  matches: Match[]
  brands: Match[]
  statuses: Partial<Record<string, RequestStatus>>
  report: Report | null
  // Proposals brands sent the group.
  offers: SponsorOffer[]
}): NotificationItem[] {
  const answered = (status: RequestStatus) =>
    Object.keys(statuses)
      .filter((id) => statuses[id] === status)
      .map((id) => brands.find((brand) => brand.id === id)?.name ?? id)
  const accepted = answered("수락")
  const declined = answered("거절")
  const items: NotificationItem[] = []
  const waiting = offers.filter((offer) => offer.status === "검토 중")
  if (waiting.length > 0) {
    items.push({
      key: "offers",
      icon: "inbox",
      title: t("새 협찬 제안 {count}건", { count: waiting.length }),
      caption: t("{names} · 답을 기다리고 있어요", { names: nameList(waiting.map((offer) => offer.brandName)) }),
      target: "받은 협찬",
    })
  }
  if (accepted.length > 0) {
    items.push({
      key: "accepted",
      icon: "check",
      good: true,
      title: t("협찬이 확정됐어요"),
      caption: t("{names} · 제안 수락", { names: nameList(accepted) }),
      target: "추천 매칭",
    })
  }
  if (declined.length > 0) {
    items.push({
      key: "declined",
      icon: "inbox",
      title: t("거절된 제안 {count}건", { count: declined.length }),
      caption: t("다른 브랜드에도 제안해 보세요."),
      target: "추천 매칭",
    })
  }
  items.push({
    key: "matches",
    icon: "spark",
    title: t("새 추천 매칭 {count}건", { count: matches.length }),
    caption: t("다가오는 일정과 잘 맞는 파트너를 찾았어요."),
    target: "추천 매칭",
  })
  // Once the event shown on the report pages is over.
  if (report && measureState(report) === "측정 완료") {
    items.push({
      key: "report",
      icon: "chart",
      good: true,
      title: t("성과 리포트가 완성됐어요"),
      caption: `${report.eventName} · ROAS ${roasText(report)}`,
      target: "리포트",
    })
  }
  return items
}

export function brandNotifications({
  matches,
  requests,
  sponsorships,
}: {
  matches: Match[]
  requests: SponsorRequest[]
  sponsorships: Sponsorship[]
}): NotificationItem[] {
  const pending = requests.filter((request) => request.status === "검토 중")
  const latest = sponsorships[0]
  const items: NotificationItem[] = []
  if (pending.length > 0) {
    items.push({
      key: "requests",
      icon: "inbox",
      title: t("새 협찬 제안 {count}건", { count: pending.length }),
      caption: t("{names} · 답을 기다리고 있어요", { names: nameList(pending.map((request) => request.groupName)) }),
      target: "받은 제안",
    })
  }
  items.push({
    key: "groups",
    icon: "users",
    title: t("추천 학생단체 {count}곳", { count: matches.length }),
    caption: t("캠페인과 잘 맞는 단체를 찾았어요."),
    target: "단체 찾기",
  })
  if (latest) {
    items.push({
      key: "analytics",
      icon: "chart",
      good: true,
      title: t("협찬 성과가 집계됐어요"),
      caption: `${latest.eventName} · ROAS ${roasOf(latest)}%`,
      target: "성과 분석",
    })
  }
  return items
}
