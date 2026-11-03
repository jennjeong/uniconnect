import { useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon, type IconName } from "../components/Icon"
import { Pill } from "../components/Pill"
import { Presence } from "../components/Presence"
import { t } from "../i18n"
import { formatFullDate, formatPeriod } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import { GradeRing, HeadlineFigures, Section, sections } from "../report/insightSections"
import { InsightExport } from "../report/InsightExport"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { InsightAnswer, PremiumReport } from "../types"

// What the report holds beyond the free screens, for the preview: twelve
// pages of analysis.
const contents: { icon: IconName; title: string; text: string }[] = [
  { icon: "spark", title: "종합 등급과 핵심 요약", text: "목표 항목 평균 달성률로 매긴 등급과, 꼭 알아야 할 세 문장" },
  { icon: "file", title: "행사 개요와 협찬 조건", text: "단체 · 기간 · 장소, 협찬 가치 구성, 쿠폰과 확인 방식" },
  { icon: "check", title: "목표 대비 성과", text: "7개 목표의 실제 · 목표 · 달성률" },
  { icon: "users", title: "관객 구성", text: "참여자 설문으로 본 학년 · 전공 계열 · 처음 온 손님 비율" },
  { icon: "chart", title: "전환 퍼널과 이탈", text: "단계별 전환과 이탈, 다른 행사들의 중앙값과 순위" },
  { icon: "calendar", title: "시간 분석", text: "시간대별 스캔과 날짜별 스캔 · 쿠폰 · 방문" },
  { icon: "store", title: "매장 방문 분석", text: "쿠폰 사용률, 당일 방문, 요일별 방문, 방문까지 걸린 날, 새 손님 추정" },
  { icon: "won", title: "비용 효율과 투자 회수", text: "결과 1건당 비용, 손익분기 방문 수, 1인 지출에 따른 ROAS" },
  { icon: "arrow", title: "평소 대비 효과", text: "매장의 평소 방문객과 비교한 증분 방문 · 매출 · ROAS" },
  { icon: "link", title: "계약 이행 · 후기 · 파트너 이력", text: "약속한 일과 증빙, 현장 확인, 서로 남긴 후기, 단체의 이력" },
  { icon: "briefcase", title: "우리 브랜드 협찬 중 위치와 다음 제안", text: "브랜드 평균과 비교, 할 일, 적정 협찬액, 함께하기 좋은 단체" },
  { icon: "search", title: "측정 방법과 부록", text: "계산식과 가정, 날짜별 · 시간대별 원자료 표" },
]

// The report itself: the cover on Stride's deep blue mesh with the grade,
// then the sections; the brand's own adds its store's counts, saves the PDF
// and shares a read-only link.
function ReportBody({
  report,
  owner,
  shareToken,
  onSaveLift,
  onShare,
  onUnshare,
  onOpenGroup,
  onNotice,
}: {
  report: PremiumReport
  owner: boolean
  shareToken?: string
  onSaveLift?: (body: { before: number; during: number }) => Promise<boolean>
  onShare?: () => void
  onUnshare?: () => void
  onOpenGroup?: (id: string) => void
  onNotice: (message: string) => void
}) {
  const [exporting, setExporting] = useState(false)
  const done = useCallback(
    (failed: boolean) => {
      setExporting(false)
      onNotice(failed ? t("PDF를 만들지 못했어요. 다시 시도해 주세요.") : t("리포트를 PDF로 저장했어요."))
    },
    [onNotice],
  )
  const shareUrl = shareToken ? `${window.location.origin}/report/${shareToken}` : ""
  return (
    <>
      <header className="insight-hero">
        <MeshBackdrop seed={7.3} />
        <div className="insight-hero-inner">
          <div>
            <span className="eyebrow light">
              {t("상세 성과 리포트")} · {report.number}
            </span>
            <h1>{report.sponsorship.eventName}</h1>
            <p>
              {report.sponsorship.brandName} × {report.sponsorship.groupName}
            </p>
            <p>
              {formatPeriod(report.event.date, report.event.endDate)}
              {report.event.venue && ` · ${report.event.venue}`}
              {report.event.people && ` · ${t("예상 {count}명", { count: report.event.people.replace(/명$/, "") })}`}
            </p>
            <span className={report.final ? "insight-status final" : "insight-status"}>
              {report.final ? t("최종") : t("집계 중 · {date} 확정", { date: formatFullDate(report.finalOn) })}
            </span>
          </div>
          <GradeRing report={report} />
        </div>
        <div className="insight-hero-actions">
          <Pill disabled={exporting} onClick={() => setExporting(true)} variant="white">
            <Icon name="download" size={15} /> {exporting ? t("PDF 만드는 중…") : t("PDF로 저장")}
          </Pill>
          {owner &&
            (shareToken ? (
              <>
                <Pill
                  onClick={() =>
                    void navigator.clipboard.writeText(shareUrl).then(
                      () => onNotice(t("공유 링크를 복사했어요. 링크가 있는 사람은 누구나 볼 수 있어요.")),
                      () => onNotice(shareUrl),
                    )
                  }
                  variant="outline-light"
                >
                  <Icon name="copy" size={15} /> {t("공유 링크 복사")}
                </Pill>
                <button className="insight-unshare" onClick={onUnshare} type="button">
                  {t("공유 끄기")}
                </button>
              </>
            ) : (
              onShare && (
                <Pill onClick={onShare} variant="outline-light">
                  <Icon name="share" size={15} /> {t("공유 링크 만들기")}
                </Pill>
              )
            ))}
        </div>
      </header>

      <HeadlineFigures report={report} />

      <div className="insight-sections">
        {sections(report, { owner, onSaveLift, onOpenGroup }).map((section) => (
          <Section icon={section.icon} id={`insight-${section.id}`} key={section.id} lead={section.lead} title={section.title}>
            {section.body}
          </Section>
        ))}
      </div>
      {exporting && <InsightExport onDone={done} report={report} />}
    </>
  )
}

// 상세 성과 리포트 (/insights/<id>): a brand's detailed report of one
// sponsorship, or a preview of what it holds with its price until bought;
// /report/<token> shows one shared read-only.
export function InsightPage({
  id,
  shareToken,
  loggedIn,
  paid = 0,
  onBack,
  onLogin,
  onNotice,
  onOpenGroup,
}: {
  // The sponsorship, for the brand's own report.
  id?: string
  // The shared link's token instead.
  shareToken?: string
  // Visitors log in before buying.
  loggedIn: boolean
  // Counts payments finished in the payment window, so the page reads again.
  paid?: number
  onBack: () => void
  onLogin: () => void
  onNotice: (message: string) => void
  onOpenGroup: (listingId: string) => void
}) {
  const [answer, setAnswer] = useState<InsightAnswer>()
  const [failed, setFailed] = useState("")
  const [buying, setBuying] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed("")
    const loading = shareToken
      ? api.sharedInsight(shareToken).then(({ report }): InsightAnswer => ({ locked: false, report, editable: false, shared: true }))
      : api.insight(id ?? "")
    loading.then(
      (result) => {
        if (!cancelled) setAnswer(result)
      },
      (error: unknown) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, shareToken, paid])

  const back = (
    <div className="detail-top">
      <button aria-label={t("뒤로")} className="back-pill" onClick={onBack} type="button">
        <Icon name="chevron" size={16} />
        <span>{t("뒤로")}</span>
      </button>
    </div>
  )

  if (!answer) {
    return (
      <section className="page-view insight-page">
        {back}
        <p className="day-empty">{failed || t("리포트를 불러오고 있어요…")}</p>
      </section>
    )
  }

  if (answer.locked) {
    const { sponsorship } = answer
    return (
      <section className="page-view insight-page">
        {back}
        <header className="insight-hero locked">
          <MeshBackdrop seed={7.3} />
          <div className="insight-hero-inner">
            <div>
              <span className="eyebrow light">{t("상세 성과 리포트")}</span>
              <h1>{sponsorship.eventName}</h1>
              <p>
                {sponsorship.groupName} · {formatFullDate(sponsorship.date)}
              </p>
            </div>
            <span aria-hidden="true" className="insight-lock">
              <Icon name="lock" size={34} />
            </span>
          </div>
        </header>
        <div className="insight-offer">
          <div>
            <h2>{t("화면에서 보는 숫자 너머의 리포트")}</h2>
            <p>{t("성과 분석 화면의 쿠폰 · 방문 · ROAS에 더해, 이 협찬 하나를 깊이 읽고 다음 결정을 돕는 리포트예요. PDF로 저장하고 링크로 공유할 수 있어요.")}</p>
            <ul className="insight-contents">
              {contents.map((item) => (
                <li key={item.title}>
                  <Icon name={item.icon} size={18} />
                  <span>
                    <strong>{t(item.title)}</strong>
                    <small>{t(item.text)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <aside className="insight-price">
            <span>{t("협찬 1건")}</span>
            <strong>{fullWon(answer.price)}</strong>
            <small>{t("부가세 별도 · 한 번 사면 계속 볼 수 있어요")}</small>
            {answer.open ? (
              <button className="primary-button wide" onClick={() => (loggedIn ? setBuying(true) : onLogin())} type="button">
                {loggedIn ? t("리포트 사기") : t("로그인하고 리포트 사기")}
              </button>
            ) : (
              <p className="field-hint">{t("행사 날부터 살 수 있어요.")}</p>
            )}
          </aside>
        </div>
        <Presence show={buying}>
          <PaymentModal
            amount={answer.price}
            kind="report"
            lines={[
              { label: t("상품"), value: t("상세 성과 리포트") },
              { label: t("환불"), value: t("연 뒤에는 환불되지 않아요") },
              { label: t("협찬"), value: `${sponsorship.eventName} · ${sponsorship.groupName}` },
            ]}
            onClose={() => setBuying(false)}
            onTransferAsked={() => {
              setBuying(false)
              onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 리포트가 열려요."))
            }}
            targetId={sponsorship.id}
            title={t("상세 성과 리포트 결제")}
          />
        </Presence>
      </section>
    )
  }

  const owner = !shareToken && answer.editable
  return (
    <section className="page-view insight-page">
      {!shareToken ? back : null}
      {shareToken && (
        <p className="insight-shared-note">
          {t("링크로 공유된 리포트예요.")}{" "}
          <button className="subtle-link" onClick={onLogin} type="button">
            {t("uniconnect 시작하기")}
          </button>
        </p>
      )}
      <ReportBody
        onNotice={onNotice}
        onOpenGroup={onOpenGroup}
        onSaveLift={
          owner && id
            ? async (body) => {
                try {
                  const { report } = await api.saveLift(id, body)
                  setAnswer({ ...answer, report })
                  onNotice(t("평소 대비 효과를 계산했어요."))
                  return true
                } catch (error) {
                  onNotice(errorMessage(error))
                  return false
                }
              }
            : undefined
        }
        onShare={
          owner && id
            ? () =>
                void api.shareInsight(id).then(
                  ({ shareToken: token }) => {
                    setAnswer({ ...answer, shared: true, shareToken: token })
                    onNotice(t("공유 링크를 만들었어요. 복사해서 보내 주세요."))
                  },
                  (error: unknown) => onNotice(errorMessage(error)),
                )
            : undefined
        }
        onUnshare={
          owner && id
            ? () =>
                void api.unshareInsight(id).then(
                  () => {
                    setAnswer({ ...answer, shared: false, shareToken: undefined })
                    onNotice(t("공유를 껐어요. 예전 링크는 더 열리지 않아요."))
                  },
                  (error: unknown) => onNotice(errorMessage(error)),
                )
            : undefined
        }
        owner={owner}
        report={answer.report}
        shareToken={answer.shareToken}
      />
    </section>
  )
}
