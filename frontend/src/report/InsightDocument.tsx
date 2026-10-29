import { t } from "../i18n"
import { formatFullDate, formatPeriod } from "../lib/date"
import type { PremiumReport } from "../types"
import {
  Advice,
  Costs,
  Effect,
  Fulfillment,
  Funnel,
  GradeRing,
  HeadlineFigures,
  KeyFindings,
  Methodology,
  Scorecard,
  Section,
  Timing,
  VenueAndReviews,
} from "./insightSections"

// The detailed report as five A4 pages (report/pdf.ts makes them a PDF):
// the cover with the grade, figures and findings; the goals and the funnel;
// costs and when people came; the effect, what each side did and the
// reviews; what to do next and how it was measured.
export function InsightDocument({ report }: { report: PremiumReport }) {
  const foot = (page: number) => (
    <footer className="insight-pdf-foot">
      <span>uniconnect · {report.number}</span>
      <span>{page} / 5</span>
    </footer>
  )
  return (
    <>
      <section className="pdf-page insight-pdf">
        <header className="insight-pdf-cover">
          <div>
            <span className="insight-pdf-kicker">
              {t("상세 성과 리포트")} · {report.number}
            </span>
            <h1>{report.sponsorship.eventName}</h1>
            <p>
              {report.sponsorship.brandName} × {report.sponsorship.groupName}
            </p>
            <p>
              {formatPeriod(report.event.date, report.event.endDate)}
              {report.event.venue && ` · ${report.event.venue}`}
            </p>
          </div>
          <GradeRing report={report} />
        </header>
        <HeadlineFigures report={report} />
        <Section icon="spark" id="pdf-findings" title={t("핵심 요약")}>
          <KeyFindings report={report} />
        </Section>
        <p className="insight-pdf-date">{t("{date} 기준", { date: formatFullDate(report.issuedAt.slice(0, 10)) })}</p>
        {foot(1)}
      </section>
      <section className="pdf-page insight-pdf">
        <Section icon="check" id="pdf-score" title={t("목표 대비 성과")}>
          <Scorecard report={report} />
        </Section>
        <Section icon="chart" id="pdf-funnel" lead={t("단계마다 uniconnect의 다른 행사와 비교했어요.")} title={t("전환 퍼널과 비교")}>
          <Funnel report={report} />
        </Section>
        {foot(2)}
      </section>
      <section className="pdf-page insight-pdf">
        <Section icon="won" id="pdf-costs" title={t("비용 효율")}>
          <Costs report={report} />
        </Section>
        <Section icon="calendar" id="pdf-timing" title={t("언제 왔나요")}>
          <Timing report={report} />
        </Section>
        {foot(3)}
      </section>
      <section className="pdf-page insight-pdf">
        <Section icon="store" id="pdf-effect" lead={t("매장이 적은 하루 방문객으로 계산한 추정이에요.")} title={t("평소 대비 효과")}>
          <Effect report={report} />
        </Section>
        <Section icon="file" id="pdf-fulfillment" title={t("계약 이행")}>
          <Fulfillment report={report} />
          <VenueAndReviews report={report} />
        </Section>
        {foot(4)}
      </section>
      <section className="pdf-page insight-pdf">
        <Section icon="arrow" id="pdf-advice" title={t("다음 협찬 제안")}>
          <Advice report={report} />
        </Section>
        <Section icon="search" id="pdf-method" title={t("측정 방법과 가정")}>
          <Methodology report={report} />
        </Section>
        {foot(5)}
      </section>
    </>
  )
}
