import { useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Icon, type IconName } from "../components/Icon"
import { Pill } from "../components/Pill"
import { Presence } from "../components/Presence"
import { t } from "../i18n"
import { formatFullDate, formatPeriod } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
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
} from "../report/insightSections"
import { InsightExport } from "../report/InsightExport"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { InsightAnswer, PremiumReport } from "../types"

// What the report holds beyond the free screens, for the preview.
const contents: { icon: IconName; title: string; text: string }[] = [
  { icon: "spark", title: "종합 등급과 핵심 요약", text: "목표 항목 평균 달성률로 매긴 등급과, 꼭 알아야 할 세 문장" },
  { icon: "check", title: "목표 대비 성과", text: "도달 · 스캔 · 쿠폰 · 방문 · 참여율 · 전환율 · ROAS를 목표와 나란히" },
  { icon: "chart", title: "다른 행사와 비교", text: "퍼널 단계마다 uniconnect에서 측정한 행사들의 중앙값과 순위" },
  { icon: "won", title: "비용 효율", text: "도달 1,000명 · 스캔 · 쿠폰 · 방문 1명당 비용과 비교" },
  { icon: "calendar", title: "언제 왔나요", text: "시간대별 스캔, 날짜별 기록, 쿠폰을 받고 방문하기까지 걸린 날" },
  { icon: "store", title: "평소 대비 효과", text: "매장의 평소 방문객과 비교한 증분 방문 · 매출 · ROAS" },
  { icon: "file", title: "계약 이행과 후기", text: "두 쪽이 약속한 일과 증빙, 현장 확인 집계, 서로 남긴 후기" },
  { icon: "arrow", title: "다음 협찬 제안", text: "이번 결과로 정한 할 일, 적정 협찬액, 다음에 함께하기 좋은 단체" },
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
        <Section icon="spark" id="insight-findings" title={t("핵심 요약")}>
          <KeyFindings report={report} />
        </Section>
        <Section icon="check" id="insight-score" lead={t("학생단체가 행사 전에 정한 목표와 실제 결과예요.")} title={t("목표 대비 성과")}>
          <Scorecard report={report} />
        </Section>
        <Section icon="chart" id="insight-funnel" lead={t("단계마다 uniconnect의 다른 행사와 비교했어요.")} title={t("전환 퍼널과 비교")}>
          <Funnel report={report} />
        </Section>
        <Section icon="won" id="insight-costs" lead={t("결과 하나를 얻는 데 든 협찬액이에요.")} title={t("비용 효율")}>
          <Costs report={report} />
        </Section>
        <Section icon="calendar" id="insight-timing" lead={t("다음 행사의 부스 시간과 쿠폰 기한을 정할 때 보세요.")} title={t("언제 왔나요")}>
          <Timing report={report} />
        </Section>
        <Section
          icon="store"
          id="insight-effect"
          lead={t("쿠폰을 쓰지 않은 손님까지, 매장이 적은 하루 방문객으로 평소와 비교해요.")}
          title={t("평소 대비 효과")}
        >
          <Effect onSave={owner ? onSaveLift : undefined} report={report} />
        </Section>
        <Section icon="file" id="insight-fulfillment" lead={t("임시 전자 계약서에 적은 할 일과 증빙이에요.")} title={t("계약 이행")}>
          <Fulfillment report={report} />
          <VenueAndReviews report={report} />
        </Section>
        <Section icon="arrow" id="insight-advice" lead={t("이번 결과로 정한 다음 할 일이에요.")} title={t("다음 협찬 제안")}>
          <Advice onOpenGroup={owner ? onOpenGroup : undefined} report={report} />
        </Section>
        <Section icon="search" id="insight-method" title={t("측정 방법과 가정")}>
          <Methodology report={report} />
        </Section>
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
            <small>{t("부가세 포함 · 한 번 사면 계속 볼 수 있어요")}</small>
            {answer.open ? (
              <button className="primary-button wide" onClick={() => setBuying(true)} type="button">
                {t("리포트 사기")}
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
