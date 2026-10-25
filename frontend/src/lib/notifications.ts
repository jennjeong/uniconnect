import type { IconName } from "../components/Icon"
import type {
  EventItem,
  Match,
  NavLabel,
  Report,
  RequestStatus,
  SponsorOffer,
  SponsorRequest,
  Sponsorship,
} from "../types"
import { t } from "../i18n"
import { daysUntil, todayIso } from "./date"
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

// Days three days away or nearer, nearest first, at the top of the notices:
// "오늘은 ‘X’ 날이에요", "내일은 ‘X’ 날이에요", "‘X’까지 3일 남았어요".
export function soonNotices(
  entries: { id: string; name: string; date: string }[],
  target: NavLabel,
  today = todayIso(),
): NotificationItem[] {
  return entries
    .map((entry) => ({ entry, days: daysUntil(entry.date, today) }))
    .filter(({ days }) => days >= 0 && days <= 3)
    .sort((a, b) => a.days - b.days)
    .map(({ entry, days }) => ({
      key: `soon-${entry.id}`,
      icon: "calendar",
      title:
        days === 0
          ? t("오늘은 ‘{name}’ 날이에요", { name: entry.name })
          : days === 1
            ? t("내일은 ‘{name}’ 날이에요", { name: entry.name })
            : t("‘{name}’까지 {days}일 남았어요", { name: entry.name, days }),
      caption: t("임시 전자 계약서에서 두 쪽이 할 일을 확인해 보세요."),
      target,
    }))
}

export function studentNotifications({
  matches,
  brands,
  statuses,
  report,
  offers,
  events,
}: {
  matches: Match[]
  brands: Match[]
  statuses: Partial<Record<string, RequestStatus>>
  report: Report | null
  // Proposals brands sent the group.
  offers: SponsorOffer[]
  // The group's events, for the days that are near.
  events: EventItem[]
}): NotificationItem[] {
  const answered = (status: RequestStatus) =>
    Object.keys(statuses)
      .filter((id) => statuses[id] === status)
      .map((id) => brands.find((brand) => brand.id === id)?.name ?? id)
  const accepted = answered("수락")
  const declined = answered("거절")
  const items: NotificationItem[] = soonNotices(events, "내 행사")
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
  // Only once there is a match to see (a member's partners are members).
  if (matches.length > 0) {
    items.push({
      key: "matches",
      icon: "spark",
      title: t("새 추천 매칭 {count}건", { count: matches.length }),
      caption: t("다가오는 일정과 잘 맞는 파트너를 찾았어요."),
      target: "추천 매칭",
    })
  }
  // Once the event shown on the report pages is over.
  if (report && measureState(report) === "진행 완료") {
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
  events,
}: {
  matches: Match[]
  requests: SponsorRequest[]
  sponsorships: Sponsorship[]
  // The brand's campaigns; with the events it sponsors, for the days near.
  events: EventItem[]
}): NotificationItem[] {
  const pending = requests.filter((request) => request.status === "검토 중")
  const latest = sponsorships[0]
  const sponsored = requests
    .filter((request) => request.status === "수락" && request.eventDate)
    .map((request) => ({ id: request.id, name: `${request.groupName} ${request.eventName}`, date: request.eventDate }))
  const items: NotificationItem[] = soonNotices([...events, ...sponsored], "행사 일정")
  if (pending.length > 0) {
    items.push({
      key: "requests",
      icon: "inbox",
      title: t("새 협찬 제안 {count}건", { count: pending.length }),
      caption: t("{names} · 답을 기다리고 있어요", { names: nameList(pending.map((request) => request.groupName)) }),
      target: "받은 제안",
    })
  }
  if (matches.length > 0) {
    items.push({
      key: "groups",
      icon: "users",
      title: t("추천 학생단체 {count}곳", { count: matches.length }),
      caption: t("캠페인과 잘 맞는 단체를 찾았어요."),
      target: "단체 찾기",
    })
  }
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
