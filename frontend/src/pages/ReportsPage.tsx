import { useState, type CSSProperties } from "react"

import { AnimatedNumber } from "../components/AnimatedNumber"
import { LedgerCard } from "../components/LedgerCard"
import { EventPicker } from "../components/EventPicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { TabBar } from "../components/TabBar"
import { RevealTitle } from "../components/RevealText"
import { metricInfo } from "../data/metrics"
import { venueSummary } from "../data/methods"
import { t } from "../i18n"
import { reportCsv } from "../lib/csv"
import { formatFullDate } from "../lib/date"
import { saveFile } from "../lib/download"
import { historyCsv, sponsorHistory, trackRecord, type Term } from "../lib/history"
import {
  achievement,
  formatKpi,
  formatWon,
  hasRoas,
  kpiValue,
  reportKpis,
  roasText,
  type KpiKey,
} from "../lib/kpis"
import { measureState, venueKindsOf } from "../lib/measurements"
import { LayersGradient } from "../scenes/LayersGradient"
import { INTERFERENCE } from "../scenes/shaders"
import type { EventMeasurement, Metrics, Report } from "../types"

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// 목표 대비 ROAS로 만든 "협찬 성과가 목표보다 43% 높았어요." 같은
// 문장(lib/kpis.ts의 roasSummary가 계산한다). 보이는 언어로 쓴다.
function roasHeadline(report: Report) {
  const gain = Math.round((report.roas / Math.max(1, report.targets.roas) - 1) * 100)
  return gain >= 0
    ? t("협찬 성과가 목표보다 {gain}% 높았어요.", { gain })
    : t("협찬 성과가 목표보다 {gain}% 낮았어요.", { gain: -gain })
}

// 행사 하나의 결과(시작한 가장 최근 행사, 또는 고른 행사): 짙은 파란색 패널
// 위의 ROAS 카드 옆 헤드라인(두 파원의 파동이 만나는 곳에서 더해지는
// getlayers.ai의 Interference 그라디언트가 협찬과 닮았다), 이어서 각 목표를
// 상세로 열리는 카드로.
export function ReportsPage({
  measurements,
  report,
  onSelect,
  metrics,
  exporting,
  onDownload,
  onOpenReport,
  onOpenGoal,
  onNotice,
  terms = [],
  onSaveTerms,
}: {
  // 단체의 모든 행사. 리포트를 볼 행사를 고른다.
  measurements: EventMeasurement[]
  report: Report | null
  onSelect: (eventId: string) => void
  metrics: Metrics
  // PDF를 만드는 동안 true.
  exporting: boolean
  onDownload: () => void
  onOpenReport: () => void
  onOpenGoal: (key: KpiKey) => void
  // 회원 단체의 협찬 결산 공개(방문자와 데모에는 없다).
  onNotice?: (message: string) => void
  // 기수: 단체의 팀과 그 저장(회원 전용).
  terms?: Term[]
  onSaveTerms?: (terms: Term[]) => Promise<boolean>
}) {
  // ROAS 막대 눈금. 결과와 목표 중 큰 값보다 여유를 둔다.
  const roasScale = report ? Math.max(1, report.roas, report.targets.roas) * 1.15 : 1

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Performance Reports"
        title={t("성과 리포트")}
        description={t("행사가 끝나면, 참여와 협찬 효과를 한 장으로 정리해 드려요.")}
        actions={
          <>
            <Pill arrow="up-right" disabled={!report || exporting} onClick={onDownload}>
              {exporting ? t("PDF 만드는 중…") : t("PDF 리포트 다운로드")}
            </Pill>
            {/* 같은 수치를 스프레드시트로(lib/csv.ts). 페이지에서 만든다. */}
            <Pill
              disabled={!report}
              onClick={() =>
                report &&
                saveFile(`uniconnect-report-${report.eventDate}.csv`, reportCsv(report, metrics), "text/csv;charset=utf-8")
              }
              variant="outline"
            >
              {t("CSV로 내보내기")}
            </Pill>
          </>
        }
      />
      {!report ? (
        <p className="day-empty">{t("행사를 등록하면 행사마다 리포트가 생겨요.")}</p>
      ) : (
        <>
          <div className="measure-bar">
            <EventPicker measurements={measurements} onSelect={onSelect} value={report.eventId} />
          </div>
          <article className="power-panel" data-reveal>
            <LayersGradient shader={INTERFERENCE} />
            <div className="power-content power-split">
              <div className="power-main">
                <div className="power-top">
                  <span className="eyebrow light">
                    {report.eventName} · {formatFullDate(report.eventDate)}
                  </span>
                  <span className="power-status">{t(measureState(report))}</span>
                </div>
                <RevealTitle as="h2" className="power-title">
                  {hasRoas(report) ? roasHeadline(report) : t("협찬 가치를 정하면 ROAS가 계산돼요")}
                </RevealTitle>
                <Pill arrow="right" onClick={onOpenReport} variant="white">
                  {t("상세 데이터 보기")}
                </Pill>
              </div>
              <div className="power-roas">
                <div className="power-roas-head">
                  <span>{t("추정 ROAS")}</span>
                  <strong>
                    <AnimatedNumber value={roasText(report)} />
                  </strong>
                </div>
                <div className="power-track">
                  <i style={{ width: `${(report.roas / roasScale) * 100}%` }} />
                  <b style={{ left: `${(report.targets.roas / roasScale) * 100}%` }} />
                </div>
                <small>
                  {t("목표 {roas}% · 협찬 가치 {value}", {
                    roas: report.targets.roas,
                    value: formatWon(report.sponsorValue),
                  })}
                </small>
              </div>
            </div>
          </article>

          <div className="section-head">
            <span className="eyebrow" data-reveal>
              Goals
            </span>
            <RevealTitle as="h2" className="section-display">
              {t("목표마다 얼마나 왔을까요")}
            </RevealTitle>
          </div>
          <ul className="kpi-grid">
            {reportKpis(report, metrics).map((kpi, index) => {
              const rate = achievement(kpi)
              return (
                <li data-reveal key={kpi.key} style={delay(index * 0.08)}>
                  <button className="kpi-card" onClick={() => onOpenGoal(kpi.key)} type="button">
                    <span className="kpi-label">
                      <span className="service-index">{String(index + 1).padStart(2, "0")}</span>
                      {t(kpi.label)}
                      <Icon name="arrowUpRight" size={16} />
                    </span>
                    <strong>
                      <AnimatedNumber value={kpiValue(kpi)} />
                    </strong>
                    <span className="kpi-meter" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, rate)}%` }} />
                    </span>
                    <span className={rate >= 100 ? "kpi-status good" : "kpi-status"}>
                      {t("목표 {target}", { target: formatKpi(kpi.target, kpi.unit) })}
                      <b>{t("{rate}% 달성", { rate })}</b>
                    </span>
                    <span className="kpi-note">{kpi.note}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          {venueKindsOf(report).length > 0 && (
            <div className="analytics-card venue-card" data-reveal>
              <p className="section-title">{t("현장에서 확인한 성과")}</p>
              <dl className="goals-list">
                {venueKindsOf(report).map((kind) => (
                  <div key={kind}>
                    <dt>{t(metricInfo[kind].label)}</dt>
                    <dd>{metrics[kind].toLocaleString("ko-KR")}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {report.sponsors && report.sponsors.length > 1 && (
            <div className="analytics-card sponsor-card" data-reveal>
              <p className="section-title">{t("협찬사별 성과")}</p>
              <div className="analytics-table sponsor-table stagger" role="table" aria-label={t("협찬사별 성과")}>
                <div className="analytics-row head" role="row">
                  <span role="columnheader">{t("협찬사")}</span>
                  <span role="columnheader">{t("협찬 가치")}</span>
                  <span role="columnheader">{t("쿠폰 수령")}</span>
                  <span role="columnheader">{t("매장 방문")}</span>
                  <span role="columnheader">ROAS</span>
                </div>
                {report.sponsors.map((sponsor) => (
                  <div className="analytics-row" key={sponsor.id} role="row">
                    <span className="analytics-event" role="cell">
                      <strong>{sponsor.brandName}</strong>
                      <small>
                        {sponsor.coupon.store} · {sponsor.coupon.title}
                      </small>
                      {venueSummary(sponsor) && <small className="venue-summary">{venueSummary(sponsor)}</small>}
                    </span>
                    <span role="cell" data-label={t("협찬 가치")}>
                      {formatWon(sponsor.value)}
                    </span>
                    <span role="cell" data-label={t("쿠폰 수령")}>
                      {t("{count}장", { count: sponsor.coupons.toLocaleString("ko-KR") })}
                    </span>
                    <span role="cell" data-label={t("매장 방문")}>
                      {t("{count}명", { count: sponsor.visits.toLocaleString("ko-KR") })}
                    </span>
                    <span
                      role="cell"
                      data-label="ROAS"
                      className={sponsor.roas >= report.targets.roas ? "analytics-roas met" : "analytics-roas"}
                    >
                      {sponsor.roas}%
                    </span>
                  </div>
                ))}
              </div>
              <small className="field-hint">
                {t("참여자는 협찬사마다 쿠폰을 따로 받고 각 매장이 자기 쿠폰의 방문만 확인해요. 위 목표는 행사 전체 기준이에요.")}
              </small>
            </div>
          )}
          <SponsorHistory measurements={measurements} onOpen={onSelect} onSaveTerms={onSaveTerms} terms={terms} />
          {onNotice && <LedgerCard onNotice={onNotice} />}
        </>
      )}
    </section>
  )
}

// 단체의 협찬 기록(협찬 기록): 연 모든 행사, 그 스폰서와 결과, 그 합계, 그리고
// 팀이 다음 팀에 넘기는 파일로서의 전체.
function SponsorHistory({
  measurements,
  onOpen,
  terms,
  onSaveTerms,
}: {
  measurements: EventMeasurement[]
  onOpen: (eventId: string) => void
  terms: Term[]
  onSaveTerms?: (terms: Term[]) => Promise<boolean>
}) {
  const allRows = sponsorHistory(measurements, undefined, terms)
  // 행사를 연 학기와, 읽으려고 고른 학기.
  const shownTerms = terms.filter((term) => allRows.some((row) => row.term === term.name))
  const [term, setTerm] = useState("전체")
  const rows = term === "전체" ? allRows : allRows.filter((row) => row.term === term)
  const record = trackRecord(rows)
  const [managing, setManaging] = useState(false)
  const [termName, setTermName] = useState("")
  const [termFrom, setTermFrom] = useState("")
  return (
    <div className="analytics-card history-card" data-reveal>
      <div className="history-head">
        <div>
          <p className="section-title">{t("협찬 기록")}</p>
          <small className="field-hint">{t("운영진이 바뀌어도 이어지도록, 지금까지 연 행사와 협찬 결과를 모아 둬요.")}</small>
        </div>
        <Pill
          disabled={rows.length === 0}
          onClick={() => saveFile("uniconnect-sponsorship-history.csv", historyCsv(rows), "text/csv;charset=utf-8")}
          variant="outline"
        >
          {t("인수인계용 CSV")}
        </Pill>
      </div>
      {shownTerms.length > 0 && (
        <TabBar
          chips
          items={["전체", ...shownTerms.map((item) => item.name)].map((value) => ({ value, label: value === "전체" ? t("전체") : value }))}
          label={t("기수")}
          onChange={setTerm}
          value={term}
        />
      )}
      {onSaveTerms && (
        <div className="terms-manage">
          <button aria-expanded={managing} className="underline-link" onClick={() => setManaging(!managing)} type="button">
            {managing ? t("기수 관리 닫기") : t("기수 관리")}
          </button>
          {managing && (
            <>
              <p className="field-hint">{t("운영진이 바뀐 날과 이름(예: 제4대 하성)을 적으면 협찬 기록이 기수별로 나뉘고 인수인계 CSV에도 들어가요.")}</p>
              {terms.length > 0 && (
                <ul className="terms-list">
                  {terms.map((item) => (
                    <li key={item.from}>
                      <strong>{item.name}</strong>
                      <small>{t("{date}부터", { date: formatFullDate(item.from) })}</small>
                      <button
                        aria-label={t("{name} 지우기", { name: item.name })}
                        className="delete-button"
                        onClick={() => void onSaveTerms(terms.filter((entry) => entry !== item))}
                        type="button"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <form
                className="terms-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (await onSaveTerms([...terms, { name: termName.trim(), from: termFrom }])) {
                    setTermName("")
                    setTermFrom("")
                  }
                }}
              >
                <label>
                  {t("기수 이름")}
                  <input maxLength={30} onChange={(event) => setTermName(event.target.value)} placeholder={t("예) 제4대 하성")} value={termName} />
                </label>
                <label>
                  {t("시작한 날")}
                  <input onChange={(event) => setTermFrom(event.target.value)} type="date" value={termFrom} />
                </label>
                <button className="cancel-button" disabled={!termName.trim() || !termFrom} type="submit">
                  {t("기수 추가")}
                </button>
              </form>
            </>
          )}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="day-empty">{t("행사가 열리면 여기에 차곡차곡 쌓여요.")}</p>
      ) : (
        <>
          <dl className="history-totals">
            <div>
              <dt>{t("연 행사")}</dt>
              <dd>{t("{count}건", { count: record.events })}</dd>
            </div>
            <div>
              <dt>{t("함께한 브랜드")}</dt>
              <dd>{t("{count}곳", { count: record.brands })}</dd>
            </div>
            <div>
              <dt>{t("누적 QR 참여")}</dt>
              <dd>{record.scans.toLocaleString("ko-KR")}</dd>
            </div>
            <div>
              <dt>{t("추정 ROAS 평균")}</dt>
              <dd>{record.roas === null ? "—" : `${record.roas}%`}</dd>
            </div>
          </dl>
          <div className="analytics-table history-table" role="table" aria-label={t("협찬 기록")}>
            <div className="analytics-row head" role="row">
              <span role="columnheader">{t("행사")}</span>
              <span role="columnheader">{t("협찬사")}</span>
              <span role="columnheader">{t("QR 스캔")}</span>
              <span role="columnheader">{t("매장 방문")}</span>
              <span role="columnheader">ROAS</span>
            </div>
            {rows.map((row) => (
              <div className="analytics-row" key={row.eventId} role="row">
                <span className="analytics-event" role="cell">
                  <button className="history-open" onClick={() => onOpen(row.eventId)} type="button">
                    <strong>{row.eventName}</strong>
                    <small>
                      {row.term ? `${row.term} · ` : ""}
                      {formatFullDate(row.date)}
                    </small>
                  </button>
                </span>
                <span role="cell" data-label={t("협찬사")}>
                  {row.brands.length ? row.brands.join(", ") : t("협찬 없음")}
                </span>
                <span role="cell" data-label={t("QR 스캔")}>
                  {row.scans.toLocaleString("ko-KR")}
                </span>
                <span role="cell" data-label={t("매장 방문")}>
                  {t("{count}명", { count: row.visits.toLocaleString("ko-KR") })}
                </span>
                <span role="cell" data-label="ROAS">
                  {row.roas === null ? "—" : `${row.roas}%`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
