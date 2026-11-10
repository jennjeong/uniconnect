import { t } from "../i18n"
import { formatDay } from "../lib/date"
import { deadlineOf } from "../lib/respondBy"
import type { ProposalTerms, RequestStatus } from "../types"

// 답을 기다리는 제안 카드의 응답 기한. 받은 쪽에는 내가 답할 기한으로, 보낸 쪽에는
// 상대의 응답 기한으로 읽힌다. 임박(3일 안)·오늘·지남을 색으로 구분한다.
export function RespondBy({
  status,
  terms,
  side,
}: {
  status: RequestStatus
  terms?: ProposalTerms
  side: "received" | "sent"
}) {
  const deadline = deadlineOf({ status, terms })
  if (!deadline) return null
  const date = formatDay(deadline.date)
  const days = Math.abs(deadline.days)
  const text =
    side === "received"
      ? deadline.state === "overdue"
        ? t("답할 기한이 {days}일 지났어요 · {date}", { days, date })
        : deadline.state === "today"
          ? t("오늘까지 답해 주세요")
          : t("답할 기한 D-{days} · {date}", { days, date })
      : deadline.state === "overdue"
        ? t("상대 응답 기한이 {days}일 지났어요 · {date}", { days, date })
        : deadline.state === "today"
          ? t("오늘이 상대 응답 기한이에요")
          : t("상대 응답 기한 D-{days} · {date}", { days, date })
  return <p className={`respond-by ${deadline.state}`}>{text}</p>
}
