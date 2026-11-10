import { t, tc } from "../i18n"
import { dDayLabel, formatDay, formatFullDate } from "../lib/date"
import { preEventCheck } from "../lib/preEventCheck"
import type { Agreement } from "../types"
import { Icon } from "./Icon"

// 계약서의 '행사 전 점검'. 행사 날 바로 기록할 수 있는지를 줄마다 보여 준다.
export function PreEventCheck({ agreement }: { agreement: Agreement }) {
  const check = preEventCheck(agreement)
  if (!check) return null
  return (
    <section aria-labelledby="agreement-precheck-title" className="agreement-section pre-event-check">
      <h2 id="agreement-precheck-title">{t("행사 전 점검")}</h2>
      <p className="field-hint">
        {t("행사 {date} · {dday}", { date: formatDay(agreement.eventDate), dday: dDayLabel(agreement.eventDate) })}
      </p>
      <ul>
        {check.items.map((item) => (
          <li className={item.state} key={item.key}>
            <span aria-hidden="true" className="pre-event-mark">
              {item.state === "ok" ? <Icon name="check" size={14} /> : item.state === "todo" ? "!" : "…"}
            </span>
            <span className="sr-only">
              {item.state === "ok" ? t("준비됨") : item.state === "todo" ? tc("precheck", "할 일") : t("기다리는 중")}
            </span>
            <span>
              {t(item.text)}
              {item.detail && <small>{t("{date}부터", { date: formatFullDate(item.detail) })}</small>}
              {item.link && (
                <a className="text-link" href={item.link.href} rel="noreferrer" target="_blank">
                  {t(item.link.label)}
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
