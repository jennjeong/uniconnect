import type { IconName } from "../components/Icon"
import type { Match, NavLabel, Report, RequestStatus, SponsorRequest, Sponsorship } from "../types"
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
  return names.length > 2 ? `${shown} 외 ${names.length - 2}곳` : shown
}

export function studentNotifications({
  matches,
  brands,
  statuses,
  report,
}: {
  matches: Match[]
  brands: Match[]
  statuses: Partial<Record<string, RequestStatus>>
  report: Report | null
}): NotificationItem[] {
  const answered = (status: RequestStatus) =>
    Object.keys(statuses)
      .filter((id) => statuses[id] === status)
      .map((id) => brands.find((brand) => brand.id === id)?.name ?? id)
  const accepted = answered("수락")
  const declined = answered("거절")
  const items: NotificationItem[] = []
  if (accepted.length > 0) {
    items.push({
      key: "accepted",
      icon: "check",
      good: true,
      title: "협찬이 확정됐어요",
      caption: `${nameList(accepted)} · 제안 수락`,
      target: "추천 매칭",
    })
  }
  if (declined.length > 0) {
    items.push({
      key: "declined",
      icon: "inbox",
      title: `거절된 제안 ${declined.length}건`,
      caption: "다른 브랜드에도 제안해 보세요.",
      target: "추천 매칭",
    })
  }
  items.push({
    key: "matches",
    icon: "spark",
    title: `새 추천 매칭 ${matches.length}건`,
    caption: "다가오는 일정과 잘 맞는 파트너를 찾았어요.",
    target: "추천 매칭",
  })
  if (report) {
    items.push({
      key: "report",
      icon: "chart",
      good: true,
      title: "성과 리포트가 완성됐어요",
      caption: `${report.eventName} · ROAS ${report.roas}%`,
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
      title: `새 협찬 제안 ${pending.length}건`,
      caption: `${nameList(pending.map((request) => request.groupName))} · 답을 기다리고 있어요`,
      target: "받은 제안",
    })
  }
  items.push({
    key: "groups",
    icon: "users",
    title: `추천 학생단체 ${matches.length}곳`,
    caption: "캠페인과 잘 맞는 단체를 찾았어요.",
    target: "단체 찾기",
  })
  if (latest) {
    items.push({
      key: "analytics",
      icon: "chart",
      good: true,
      title: "협찬 성과가 집계됐어요",
      caption: `${latest.eventName} · ROAS ${roasOf(latest)}%`,
      target: "성과 분석",
    })
  }
  return items
}
