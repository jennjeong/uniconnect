import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { PageIntro } from "../components/PageIntro"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import { formatWon } from "../lib/kpis"
import type { PublicLedger } from "../types"

// 협찬 결산 공개 (/ledger/<token>): what a student group received from brands,
// for its own students to read without logging in: each sponsorship's event,
// brand, goods, amount (when the group shows amounts), turnout and its note,
// and what they add up to.
export function LedgerPage({ token }: { token: string }) {
  const [data, setData] = useState<PublicLedger | null>(null)
  const [failed, setFailed] = useState("")

  useEffect(() => {
    api.publicLedger(token).then(setData, (error: unknown) => setFailed(errorMessage(error)))
  }, [token])

  if (!data) {
    return (
      <section className="page-view">
        <PageIntro eyebrow="Sponsorship Ledger" title={t("협찬 결산")} description={failed || t("결산을 불러오고 있어요…")} />
      </section>
    )
  }

  return (
    <section className="page-view ledger-page">
      <PageIntro
        eyebrow="Sponsorship Ledger"
        title={t("{name} 협찬 결산", { name: data.group.name })}
        description={t("{school} · 학생들에게 공개하는 협찬 내역이에요.", { school: data.group.school })}
      />
      <div className="analytics-card history-card">
        <dl className="history-totals">
          <div>
            <dt>{t("받은 협찬")}</dt>
            <dd>{t("{count}건", { count: data.totals.sponsorships })}</dd>
          </div>
          <div>
            <dt>{t("함께한 브랜드")}</dt>
            <dd>{t("{count}곳", { count: data.totals.brands })}</dd>
          </div>
          {data.totals.value !== undefined && (
            <div>
              <dt>{t("협찬 가치 합계")}</dt>
              <dd>{formatWon(data.totals.value)}</dd>
            </div>
          )}
        </dl>
        {data.entries.length === 0 ? (
          <p className="day-empty">{t("아직 공개할 협찬이 없어요.")}</p>
        ) : (
          <ul className="ledger-list">
            {data.entries.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.brandName}</strong>
                  <small>
                    {entry.eventName}
                    {entry.eventDate ? ` · ${formatFullDate(entry.eventDate)}` : ""}
                  </small>
                </div>
                <p>{entry.gives}</p>
                <span className="ledger-figures">
                  {entry.value !== undefined && <b>{formatWon(entry.value)}</b>}
                  {entry.scans !== undefined && <span>{t("QR 참여 {count}명", { count: entry.scans.toLocaleString("ko-KR") })}</span>}
                </span>
                {entry.note && <p className="ledger-note">{entry.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
