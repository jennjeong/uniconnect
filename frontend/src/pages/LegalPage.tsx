import { PageIntro } from "../components/PageIntro"
import { TabBar } from "../components/TabBar"
import { t } from "../i18n"
import { legalDocs, legalDraftNote, legalEffectiveDate, type LegalKind } from "../data/legal"
import { formatFullDate } from "../lib/date"

// 이용약관(/terms)과 개인정보처리방침(/privacy). 푸터와 가입 폼에서 연결한다.
// 탭으로 둘을 오간다.
export function LegalPage({
  kind,
  onSwitch,
}: {
  kind: LegalKind
  onSwitch: (kind: LegalKind) => void
}) {
  const doc = legalDocs[kind]
  return (
    <section className="page-view legal-page">
      <PageIntro eyebrow={doc.eyebrow} title={doc.title} description={doc.summary} />
      <TabBar
        items={(Object.keys(legalDocs) as LegalKind[]).map((value) => ({
          value,
          label: legalDocs[value].title,
        }))}
        label={t("약관과 방침")}
        value={kind}
        onChange={onSwitch}
      />
      <div className="legal-meta" data-reveal>
        {doc.notice && <p className="legal-note">{doc.notice}</p>}
        <p className="legal-note">{legalDraftNote}</p>
        <p className="legal-date">{t("시행일 {date}", { date: formatFullDate(legalEffectiveDate) })}</p>
      </div>
      <ol className="legal-sections">
        {doc.sections.map((section, index) => (
          <li className="legal-section" data-reveal id={section.id} key={section.title}>
            <h2>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </h2>
            {section.body?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.items && (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {section.table && (
              <div className="legal-table-wrap">
                <table className="legal-table">
                  <thead>
                    <tr>
                      {section.table.head.map((cell) => (
                        <th key={cell} scope="col">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, column) =>
                          column === 0 ? (
                            <th key={cell} scope="row">
                              {cell}
                            </th>
                          ) : (
                            // 휴대폰에서는 각 행이 카드로 쌓이고 라벨이 셀이
                            // 무엇인지 알려 준다.
                            <td data-label={section.table?.head[column]} key={cell}>
                              {cell}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
