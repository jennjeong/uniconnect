import { daysUntil, todayIso } from "./date"
import type { Agreement, MeasureMethod } from "../types"

// 행사 전 점검: 확정된 협찬이 행사 날 바로 기록될 수 있는지. 서버가 준 계약서에서만
// 읽는다(양쪽 확인, 확정된 확인 방식, 이쪽의 현장 페이지와 PIN). 행사가 시작됐거나
// 취소된 협찬, 측정이 없는 계약서에는 없다.
export type CheckState = "ok" | "todo" | "pending"
export type CheckItem = { key: string; state: CheckState; text: string; detail?: string; link?: { href: string; label: string } }

const sameMethods = (a: MeasureMethod[], b: MeasureMethod[]) => {
  const key = (list: MeasureMethod[]) => list.map((item) => `${item.kind}:${item.side}`).sort().join(",")
  return key(a) === key(b)
}

export function preEventCheck(agreement: Agreement, today = todayIso()) {
  const measure = agreement.measure
  if (agreement.cancel?.canceledAt || !measure || !agreement.eventDate) return null
  if (agreement.event?.started || agreement.eventDate < today) return null
  const side = agreement.side
  const other = side === "group" ? "brand" : "group"
  const both = Boolean(agreement.confirmed[side] && (agreement.confirmed[other] || !agreement[other].member))
  const confirmed = measure.confirmedMethods ?? []
  const settled = confirmed.length > 0 && sameMethods(confirmed, measure.methods)
  const active = confirmed.length > 0 ? confirmed : measure.methods
  const items: CheckItem[] = [
    {
      key: "contract",
      state: both ? "ok" : "todo",
      text: both ? "양쪽이 계약서를 확인했어요" : "양쪽이 계약서를 확인해야 현장 기록이 집계돼요",
    },
    {
      key: "methods",
      state: both && settled ? "ok" : "todo",
      text:
        both && settled
          ? "협찬 확인 방식이 확정됐어요"
          : confirmed.length > 0
            ? "확인 방식을 바꿨어요. 양쪽이 다시 확인해야 바뀐 방식으로 집계돼요"
            : "확인 방식은 양쪽이 계약서를 확인하면 확정돼요",
    },
  ]
  if (active.some((method) => method.kind === "qr")) {
    items.push({
      key: "qr",
      state: "ok",
      text: "참여자 QR 체크인 페이지를 미리 열어 볼 수 있어요",
      link: { href: `/check-in/${measure.code}`, label: "체크인 페이지 열기" },
    })
  }
  const venue = measure.venue
  if (venue) {
    items.push(
      venue.pin
        ? {
            key: "pin",
            state: "ok",
            text: "현장 기록 페이지와 PIN이 준비됐어요. 현장 담당자에게 PIN을 전해 주세요",
            link: { href: `/check-in/${measure.code}/${venue.page}`, label: "현장 기록 페이지 열기" },
          }
        : { key: "pin", state: "pending", text: "PIN은 행사 하루 전부터 이 계약서에 보여요", detail: venue.pinsFrom },
    )
  }
  return { items, days: daysUntil(agreement.eventDate, today) }
}
