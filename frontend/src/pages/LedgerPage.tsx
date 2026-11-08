import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { PageIntro } from "../components/PageIntro"
import { t, tc } from "../i18n"
import { formatFullDate } from "../lib/date"
import { formatWon } from "../lib/kpis"
import type { PublicLedger } from "../types"

// 협찬 결산 공개(/ledger/<token>): 학생단체가 브랜드에서 받은 것을 자기
// 학생들이 로그인 없이 읽도록 보여 준다. 협찬마다 행사, 브랜드, 물품,
// 금액(단체가 금액을 보여 줄 때), 참석, 메모와 그 합계.
export function LedgerPage({ token }: { token: string }) {
  const [data, setData] = useState<PublicLedger | null>(null)
  const [failed, setFailed] = useState("")

  useEffect(() => {
    api.publicLedger(token).then(setData, (error: unknown) => setFailed(errorMessage(error)))
  }, [token])

  if (!data) {
    return (
      <section className="page-view">
        <PageIntro eyebrow={tc("eyebrow", "공개 결산")} title={t("협찬 결산")} description={failed || t("결산을 불러오고 있어요…")} />
      </section>
    )
  }

  return (
    <section className="page-view ledger-page">
      <PageIntro
        eyebrow={tc("eyebrow", "공개 결산")}
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
