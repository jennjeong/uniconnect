import { t } from "../i18n"
import { formatFullDate, formatPeriod } from "../lib/date"
import type { PremiumReport } from "../types"
import { GradeRing, HeadlineFigures, Section, sections } from "./insightSections"

// A4 페이지로 만든 상세 분석 리포트(report/pdf.ts가 PDF로 만든다): 등급, 수치,
// 핵심 발견이 있는 표지, 이어서 각 섹션을 번호를 매겨 한 페이지씩 열한 쪽.
export function InsightDocument({ report }: { report: PremiumReport }) {
  const [findings, ...rest] = sections(report)
  const total = rest.length + 1
  const foot = (page: number) => (
    <footer className="insight-pdf-foot">
      <span>uniconnect · {t("상세 성과 리포트")} · {report.number}</span>
      <span>
        {page} / {total}
      </span>
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
        <Section icon={findings.icon} id="pdf-findings" title={findings.title}>
          {findings.body}
        </Section>
        <ol className="insight-pdf-contents">
          {rest.map((section, index) => (
            <li key={section.id}>
              <span>{section.title}</span>
              <span>{index + 2}</span>
            </li>
          ))}
        </ol>
        <p className="insight-pdf-date">{t("{date} 기준", { date: formatFullDate(report.issuedAt.slice(0, 10)) })}</p>
        {foot(1)}
      </section>
      {rest.map((section, index) => (
        <section className="pdf-page insight-pdf" key={section.id}>
          <Section icon={section.icon} id={`pdf-${section.id}`} lead={section.lead} title={section.title}>
            {section.body}
          </Section>
          {foot(index + 2)}
        </section>
      ))}
    </>
  )
}
