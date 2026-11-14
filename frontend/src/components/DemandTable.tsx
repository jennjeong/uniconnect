import { useEffect, useRef, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import { monthLabel } from "../lib/date"
import type { EventDemand } from "../types"

// "YYYY-MM"에서 by달 옮긴 달 (백엔드 lib/demand.ts의 shiftMonth와 같다).
export function shiftMonth(month: string, by: number) {
  const [year, value] = month.split("-").map(Number)
  const index = year * 12 + value - 1 + by
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

// from부터 to까지의 달.
export function monthsBetween(from: string, to: string) {
  const months: string[] = []
  for (let month = from; month <= to && months.length < 36; month = shiftMonth(month, 1)) months.push(month)
  return months
}

// 대학별 · 시기별 행사 수요(#344, GET /api/events/demand): 학생단체의 행사 수를 학교와
// 달로 묶은 표. 한 칸이 기준(minimum)보다 적으면 서버가 보내지 않으므로, 빈칸은 0건이
// 아니라 "기준 미만이거나 없음"이다. 합계는 숨긴 칸을 드러낼 수 있어 보여 주지 않는다.
// 로그인한 회원만 본다.
export function DemandTable() {
  const [demand, setDemand] = useState<EventDemand | null>(null)
  const [failed, setFailed] = useState("")
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.eventDemand().then(setDemand, (error: unknown) => setFailed(errorMessage(error)))
  }, [])

  // 지난 달들이 앞에 있어서, 좁은 화면에서는 이번 달이 학교 이름 바로 옆에 오도록 넘겨 둔다.
  useEffect(() => {
    const box = scroller.current
    const current = box?.querySelector<HTMLElement>("thead .current")
    const school = box?.querySelector<HTMLElement>("thead th")
    if (box && current && school) box.scrollLeft = Math.max(0, current.offsetLeft - school.offsetWidth)
  }, [demand])

  const months = demand ? monthsBetween(demand.from, demand.to) : []
  const schools = demand ? [...new Set(demand.cells.map((cell) => cell.school))] : []
  const count = (school: string, month: string) =>
    demand?.cells.find((cell) => cell.school === school && cell.month === month)?.count

  return (
    <section aria-labelledby="demand-title" className="demand">
      <h2 id="demand-title">{t("학교 · 달별 행사 수")}</h2>
      <p className="field-hint">
        {t("언제 어느 학교에서 행사가 많은지 보고 협찬을 계획해요. 지난 6달부터 앞으로 11달까지예요.")}
      </p>
      {!demand ? (
        <p className="day-empty">{failed || t("행사 수를 불러오고 있어요…")}</p>
      ) : schools.length === 0 ? (
        <p className="day-empty">{t("아직 행사가 {count}건 이상 모인 학교와 달이 없어요.", { count: demand.minimum })}</p>
      ) : (
        <div aria-labelledby="demand-title" className="demand-scroll" ref={scroller} role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t("학교")}</th>
                {months.map((month, index) => (
                  <th className={month === demand.current ? "current" : undefined} key={month} scope="col">
                    {monthLabel(month, index === 0 || month.endsWith("-01"))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school}>
                  <th scope="row">{school}</th>
                  {months.map((month) => {
                    const value = count(school, month)
                    return (
                      <td className={month === demand.current ? "current" : undefined} key={month}>
                        {value === undefined ? <span aria-label={t("{count}건 미만이거나 없음", { count: demand.minimum })}>·</span> : value}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {demand && schools.length > 0 && (
        <p className="field-hint">
          {t("이름 없이 숫자로만 모았어요. 행사가 {count}건 미만인 칸은 비워 두었어요.", { count: demand.minimum })}
        </p>
      )}
    </section>
  )
}
