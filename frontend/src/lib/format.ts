import { t } from "../i18n"
import type { EventItem } from "../types"

// 표시용 협찬 종류. "기타"가 뜻하는 것을 풀어서 쓴다.
export const sponsorTypeLabels = (event: EventItem) =>
  event.types.map((type) => (type === "기타" && event.typeNote ? `${t("기타")}(${event.typeNote})` : t(type)))

export function formatRemaining(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

// 데이터가 오기 전에도 NaN이 아니라 0으로 남는 반올림 퍼센트.
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0

export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase()
