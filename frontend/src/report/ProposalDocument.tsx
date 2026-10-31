import { t } from "../i18n"
import { formatPeriod } from "../lib/date"
import { trackRecord, type HistoryRow } from "../lib/history"
import type { EventPage } from "../types"
import { PageFooter, PageHeader } from "./ReportDocument"

// As many packages as fit on the page beside the rest.
const shownPackages = 4

// One A4 page (794×1123 px): a student group's sponsorship proposal for an
// event, filled from its event page and its sponsorship record, so a brand
// reads the event, what it gets, what the group did before and how the
// results will be counted.
export function ProposalDocument({ page, history }: { page: EventPage; history: HistoryRow[] }) {
  const { event, group } = page
  const record = trackRecord(history)
  const packages = (event.packages ?? []).slice(0, shownPackages)
  const people = event.people.replace(/명$/, "")
  const types = event.types.map((type) => (type === "기타" && event.typeNote ? event.typeNote : t(type)))
  return (
    <div className="pdf-page">
      <PageHeader author={group.name} />

      <div className="pdf-title">
        <span>SPONSORSHIP PROPOSAL</span>
        <h1>{event.name}</h1>
        <p>{[group.name, group.school, t(group.category)].filter(Boolean).join(" · ")}</p>
      </div>

      <div className="pdf-summary">
        <strong>
          {formatPeriod(event.date, event.endDate)}
          {event.venue ? ` · ${event.venue}` : ""}
          {people ? ` · ${t("예상 {count}명", { count: people })}` : ""}
        </strong>
        {event.intro && <p className="pdf-proposal-intro">{event.intro}</p>}
      </div>

      <section className="pdf-section">
        <h2>{t("행사 개요")}</h2>
        <dl className="pdf-facts">
          <div>
            <dt>{t("일시")}</dt>
            <dd>{formatPeriod(event.date, event.endDate)}</dd>
          </div>
          <div>
            <dt>{t("장소")}</dt>
            <dd>{event.venue || t("정해지는 대로 알려 드려요")}</dd>
          </div>
          <div>
            <dt>{t("예상 인원")}</dt>
            <dd>{people ? t("{count}명", { count: people }) : "—"}</dd>
          </div>
          <div>
            <dt>{t("원하는 협찬")}</dt>
            <dd>{types.join(", ")}</dd>
          </div>
        </dl>
      </section>

      <section className="pdf-section">
        <h2>{t("협찬 혜택 묶음")}</h2>
        {packages.length > 0 ? (
          <ul className="pdf-packages">
            {packages.map((item) => (
              <li key={item.name}>
                <strong>{item.name}</strong>
                <p>{item.gives}</p>
                {item.asks && (
                  <small>
                    {t("원하는 협찬")} · {item.asks}
                  </small>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="pdf-card pdf-note">{t("브랜드에 맞춰 노출 위치와 협찬 품목을 함께 정해요.")}</p>
        )}
      </section>

      <section className="pdf-section">
        <h2>{t("지난 협찬 성과")}</h2>
        {record.events > 0 ? (
          <div className="pdf-kpis">
            <div className="pdf-kpi">
              <span>{t("연 행사")}</span>
              <strong>{t("{count}건", { count: record.events })}</strong>
            </div>
            <div className="pdf-kpi">
              <span>{t("함께한 브랜드")}</span>
              <strong>{t("{count}곳", { count: record.brands })}</strong>
            </div>
            <div className="pdf-kpi">
              <span>{t("누적 QR 참여")}</span>
              <strong>{record.scans.toLocaleString("ko-KR")}</strong>
            </div>
            <div className="pdf-kpi">
              <span>{t("평균 ROAS")}</span>
              <strong>{record.roas === null ? "—" : `${record.roas}%`}</strong>
            </div>
          </div>
        ) : (
          <p className="pdf-card pdf-note">{t("이번이 uniconnect에서 여는 첫 행사예요. 행사가 끝나면 측정한 결과를 리포트로 보내 드려요.")}</p>
        )}
      </section>

      <section className="pdf-section">
        <h2>{t("협찬 효과는 이렇게 확인해요")}</h2>
        <ol className="pdf-promise">
          <li>
            <b>{t("QR 체크인")}</b>
            {t("참여자가 현장 QR을 찍으면 참여 인원이 시간대별로 집계돼요.")}
          </li>
          <li>
            <b>{t("브랜드 쿠폰 · 매장 방문")}</b>
            {t("브랜드마다 쿠폰을 따로 주고, 방문은 매장 직원이 PIN으로 직접 확인해요.")}
          </li>
          <li>
            <b>{t("성과 리포트")}</b>
            {t("행사 뒤 참여 · 방문 · 추정 매출로 ROAS를 계산해 PDF로 공유해요.")}
          </li>
        </ol>
      </section>

      <PageFooter note={t("uniconnect · 협찬 제안서 · 행사 정보와 지난 측정 기록으로 만들었어요.")} page={1} total={1} />
    </div>
  )
}
