import type { IconName } from "../components/Icon"
import type {
  EventItem,
  Inquiry,
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
  // 초록색은 확정된 협찬 같은 좋은 소식을 나타낸다.
  good?: boolean
  title: string
  caption: string
  // 자세한 내용이 있는 페이지.
  target: NavLabel
  // 대신 도움말 센터의 질문을 열어, 답이 있는 곳으로 안내한다.
  faq?: true
  // 알림을 이루는 항목(받은 제안 각각 등). 전부 읽으면 읽음이 되고, 새 항목이
  // 생기면 다시 읽지 않음이 된다.
  parts: string[]
}

// 알림별로 그리고 전체로 추적하는 항목. 서버가 보관하는 만큼이다.
const partsPerNotice = 50
const partsInAll = 300
const tracked = (item: NotificationItem) => item.parts.slice(0, partsPerNotice)

// 계정이 읽지 않은 항목이 알림에 있는지 여부. 마지막으로 본 뒤에 들어온 제안
// 같은 것이다.
export const isUnread = (item: NotificationItem, read: ReadonlySet<string>) =>
  tracked(item).some((part) => !read.has(part))

// `opened`도 읽은 것으로 쳐서 저장할 읽은 항목: 화면에 있는 항목 가운데 전에
// 읽은 것과 지금 연 것이다. 더는 화면에 없는 항목은 빠지므로 목록이 종 모양
// 알림만큼 짧게 유지된다.
export function readParts(items: NotificationItem[], read: ReadonlySet<string>, opened: NotificationItem[]) {
  const now = new Set(opened.flatMap(tracked))
  return [...new Set(items.flatMap(tracked))].filter((part) => read.has(part) || now.has(part)).slice(0, partsInAll)
}

// 질문한 사람이 아직 보지 못한 운영자의 답변을, 그것들을 여는 알림 하나로
// 묶는다.
export function answerNotices(inquiries: Inquiry[]): NotificationItem[] {
  const unread = inquiries.filter((inquiry) => inquiry.answeredAt && !inquiry.answerReadAt)
  if (unread.length === 0) return []
  return [
    {
      key: "answers",
      icon: "chat",
      good: true,
      title: t("문의에 답변이 왔어요"),
      caption:
        unread.length === 1
          ? t("‘{category}’ 질문의 답을 확인해 보세요.", { category: t(unread[0].category) })
          : t("답변 {count}개를 확인해 보세요.", { count: unread.length }),
      target: "대시보드",
      faq: true,
      parts: unread.map((inquiry) => `answer:${inquiry.id}`),
    },
  ]
}

// "노원 크리에이터스, 광운대 무브먼트 외 1곳"
function nameList(names: string[]) {
  const shown = names.slice(0, 2).join(", ")
  return names.length > 2 ? t("{names} 외 {count}곳", { names: shown, count: names.length - 2 }) : shown
}

// 사흘 안으로 다가온 날을 가까운 순으로 알림 맨 위에 둔다: "오늘은 ‘X’
// 날이에요", "내일은 ‘X’ 날이에요", "‘X’까지 3일 남았어요". 각각 전날과 당일에
// 다시 읽지 않음이 된다.
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
      parts: [`soon:${entry.id}:${entry.date}:${Math.min(days, 2)}`],
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
  // 브랜드가 단체에 보낸 제안.
  offers: SponsorOffer[]
  // 다가오는 날짜를 위한 단체의 행사.
  events: EventItem[]
}): NotificationItem[] {
  // 그렇게 답한 브랜드를 id로.
  const answered = (status: RequestStatus) => Object.keys(statuses).filter((id) => statuses[id] === status)
  const names = (ids: string[]) => ids.map((id) => brands.find((brand) => brand.id === id)?.name ?? id)
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
      parts: waiting.map((offer) => `offer:${offer.id}`),
    })
  }
  if (accepted.length > 0) {
    items.push({
      key: "accepted",
      icon: "check",
      good: true,
      title: t("협찬이 확정됐어요"),
      caption: t("{names} · 제안 수락", { names: nameList(names(accepted)) }),
      target: "추천 매칭",
      parts: accepted.map((id) => `accepted:${id}`),
    })
  }
  if (declined.length > 0) {
    items.push({
      key: "declined",
      icon: "inbox",
      title: t("거절된 제안 {count}건", { count: declined.length }),
      caption: t("다른 브랜드에도 제안해 보세요."),
      target: "추천 매칭",
      parts: declined.map((id) => `declined:${id}`),
    })
  }
  // 볼 수 있는 매칭이 있을 때만 (회원의 파트너는 회원이다).
  if (matches.length > 0) {
    items.push({
      key: "matches",
      icon: "spark",
      title: t("새 추천 매칭 {count}건", { count: matches.length }),
      caption: t("다가오는 일정과 잘 맞는 파트너를 찾았어요."),
      target: "추천 매칭",
      parts: matches.map((match) => `match:${match.id}`),
    })
  }
  // 리포트 페이지에 보이는 행사가 끝난 뒤에만.
  if (report && measureState(report) === "진행 완료") {
    items.push({
      key: "report",
      icon: "chart",
      good: true,
      title: t("성과 리포트가 완성됐어요"),
      caption: `${report.eventName} · ROAS ${roasText(report)}`,
      target: "리포트",
      parts: [`report:${report.eventId}`],
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
  // 브랜드의 캠페인. 다가오는 날짜를 위해 협찬하는 행사와 함께 쓴다.
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
      parts: pending.map((request) => `request:${request.id}`),
    })
  }
  if (matches.length > 0) {
    items.push({
      key: "groups",
      icon: "users",
      title: t("추천 학생단체 {count}곳", { count: matches.length }),
      caption: t("캠페인과 잘 맞는 단체를 찾았어요."),
      target: "단체 찾기",
      parts: matches.map((match) => `match:${match.id}`),
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
      parts: [`analytics:${latest.id}`],
    })
  }
  return items
}
