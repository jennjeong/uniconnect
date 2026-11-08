import { t } from "../i18n"
import { formatFullDate } from "./date"
import type { RoasState } from "./sponsorships"

// ROAS 옆에 붙는 한 줄. 집계가 끝난 협찬만 목표와 견주고, 0원이나 집계 중인 협찬은
// 그 이유를 말한다(lib/sponsorships.ts roasState).
export function roasVerdict(row: { state: RoasState; roas: number; targetRoas: number; met: boolean; countingUntil?: string }) {
  if (row.state === "cost") return t("비용 미확정 · 계약서에 협찬액을 적으면 계산돼요")
  if (row.state === "counting") {
    return row.countingUntil
      ? t("집계 중 · {date}까지 방문이 더 들어와요", { date: formatFullDate(row.countingUntil) })
      : t("집계 중")
  }
  return row.met
    ? t("목표 {target}% 달성", { target: row.targetRoas })
    : t("목표 {target}% · {gap}%p 부족", { target: row.targetRoas, gap: row.targetRoas - row.roas })
}

// ROAS 숫자. 협찬액이 없으면 "—".
export const roasText = (row: { state: RoasState; roas: number }) => (row.state === "cost" ? "—" : `${row.roas}%`)
