import { useState, type ReactNode } from "react"

import { Icon, type IconName } from "../components/Icon"
import { methodInfo } from "../data/methods"
import { t } from "../i18n"
import { formatDateTime, formatFullDate, formatPeriod } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import type { Benchmark, PremiumReport, ScoreKey } from "../types"

// The sections of 상세 성과 리포트, shared by its page (pages/InsightPage.tsx)
// and its PDF (report/InsightDocument.tsx). They word what the server works
// out (backend lib/premiumReport.ts).

const scoreLabels: Record<ScoreKey, { label: string; unit: "명" | "건" | "장" | "%" }> = {
  reach: { label: "도달", unit: "명" },
  scans: { label: "QR 스캔", unit: "건" },
  coupons: { label: "쿠폰 수령", unit: "장" },
  visits: { label: "매장 방문", unit: "명" },
  qrRate: { label: "QR 참여율", unit: "%" },
  visitRate: { label: "방문 전환율", unit: "%" },
  roas: { label: "추정 ROAS", unit: "%" },
}

const number = (value: number) => value.toLocaleString("ko-KR")

export function withUnit(value: number, unit: "명" | "건" | "장" | "%") {
  const count = number(value)
  if (unit === "명") return t("{count}명", { count })
  if (unit === "건") return t("{count}건", { count })
  if (unit === "장") return t("{count}장", { count })
  return `${count}%`
}

const gradeWords: Record<PremiumReport["grade"], string> = {
  S: "목표를 크게 넘었어요",
  A: "목표를 달성했어요",
  B: "목표에 조금 못 미쳤어요",
  C: "목표의 절반을 넘었어요",
  D: "목표에 많이 못 미쳤어요",
}

// A benchmark in words: the median of the other events and where this one stands.
export function benchmarkLine(benchmark: Benchmark, unit: "%" | "원" = "%") {
  if (!benchmark) return t("비교할 행사가 아직 적어요")
  const median = unit === "%" ? `${benchmark.median}%` : fullWon(Math.round(benchmark.median))
  return t("행사 {count}건 중앙값 {median} · 상위 {top}%", {
    count: benchmark.count,
    median,
    top: Math.max(1, 100 - benchmark.beats),
  })
}

export function Section({ id, icon, title, lead, children }: { id: string; icon: IconName; title: string; lead?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="insight-section" id={id}>
      <header className="insight-section-head">
        <span aria-hidden="true" className="insight-section-icon">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {lead && <p>{lead}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

// The grade with the average achievement, as a ring.
export function GradeRing({ report }: { report: PremiumReport }) {
  const share = Math.min(report.achievement, 150) / 150
  return (
    <div className="insight-grade" role="img" aria-label={t("종합 등급 {grade}, 목표 달성 {rate}%", { grade: report.grade, rate: report.achievement })}>
      <svg aria-hidden="true" viewBox="0 0 120 120">
        <circle className="track" cx="60" cy="60" r="52" />
        <circle className="value" cx="60" cy="60" r="52" strokeDasharray={`${share * 326.7} 326.7`} />
      </svg>
      <strong>{report.grade}</strong>
      <small>{t("목표 달성 {rate}%", { rate: report.achievement })}</small>
    </div>
  )
}

// The four figures a reader looks for first.
export function HeadlineFigures({ report }: { report: PremiumReport }) {
  const find = (key: ScoreKey) => report.scorecard.find((item) => item.key === key)!
  const figures = [
    { label: t("도달"), value: withUnit(find("reach").actual, "명"), note: t("현장 QR + SNS") },
    { label: t("매장 방문"), value: withUnit(find("visits").actual, "명"), note: t("쿠폰으로 확인") },
    { label: t("추정 매출"), value: fullWon(report.sales), note: t("방문 × 1인 {spend}", { spend: fullWon(report.averageSpend) }) },
    { label: t("추정 ROAS"), value: `${find("roas").actual}%`, note: t("목표 {target}%", { target: find("roas").target }) },
  ]
  return (
    <dl className="insight-figures">
      {figures.map((figure) => (
        <div key={figure.label}>
          <dt>{figure.label}</dt>
          <dd>
            {figure.value}
            <small>{figure.note}</small>
          </dd>
        </div>
      ))}
    </dl>
  )
}

// Three sentences that sum the report up: the grade, the ROAS against its
// goal, and the step that stood out most against the other events.
export function KeyFindings({ report }: { report: PremiumReport }) {
  const roas = report.scorecard.find((item) => item.key === "roas")!
  const steps = report.funnel.filter((step) => step.benchmark)
  const best = [...steps].sort((a, b) => b.benchmark!.beats - a.benchmark!.beats)[0]
  const stepNames = { audience: "예상 관객", scans: "QR 참여", coupons: "쿠폰 수령", visits: "매장 방문" }
  const findings = [
    t("종합 {grade}등급 · {words}. 목표 항목 평균 달성률은 {rate}%예요.", {
      grade: report.grade,
      words: t(gradeWords[report.grade]),
      rate: report.achievement,
    }),
    roas.actual >= roas.target
      ? t("협찬액 {spend}으로 추정 매출 {sales}을 만들어 ROAS {roas}%를 기록했어요. 목표 {target}%보다 {gap}%p 높아요.", {
          spend: fullWon(report.spend),
          sales: fullWon(report.sales),
          roas: roas.actual,
          target: roas.target,
          gap: Math.round((roas.actual - roas.target) * 10) / 10,
        })
      : t("협찬액 {spend}으로 추정 매출 {sales}, ROAS {roas}%예요. 목표 {target}%까지 {gap}%p 남았어요.", {
          spend: fullWon(report.spend),
          sales: fullWon(report.sales),
          roas: roas.actual,
          target: roas.target,
          gap: Math.round((roas.target - roas.actual) * 10) / 10,
        }),
    best
      ? t("{step} 단계가 uniconnect 행사 {count}건 중 상위 {top}%로 가장 돋보였어요.", {
          step: t(stepNames[best.key]),
          count: best.benchmark!.count,
          top: Math.max(1, 100 - best.benchmark!.beats),
        })
      : report.effect
        ? t("매장 하루 방문객이 평소보다 {lift}% 늘었어요.", { lift: report.effect.lift })
        : t("다른 행사와 비교할 데이터가 쌓이면 이 자리에 순위를 보여 드려요."),
  ]
  return (
    <ol className="insight-findings">
      {findings.map((finding) => (
        <li key={finding}>{finding}</li>
      ))}
    </ol>
  )
}

// Each goal against what happened, as a bar to its target.
export function Scorecard({ report }: { report: PremiumReport }) {
  return (
    <ul className="insight-scorecard">
      {report.scorecard.map((item) => {
        const { label, unit } = scoreLabels[item.key]
        const share = item.achievement === null ? 0 : Math.min(item.achievement, 150) / 150
        const met = item.achievement !== null && item.achievement >= 100
        return (
          <li key={item.key}>
            <span className="insight-score-label">{t(label)}</span>
            <span aria-hidden="true" className="insight-bar">
              <span className={met ? "fill met" : "fill"} style={{ width: `${share * 100}%` }} />
              <span className="goal" style={{ left: `${(100 / 150) * 100}%` }} />
            </span>
            <span className="insight-score-figures">
              <strong>{withUnit(item.actual, unit)}</strong>
              <small>
                {t("목표 {target}", { target: withUnit(item.target, unit) })}
                {item.achievement !== null && ` · ${item.achievement}%`}
              </small>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

// The funnel from the expected audience to store visits, each step's rate
// beside the median of the other events.
export function Funnel({ report }: { report: PremiumReport }) {
  const names = { audience: "예상 관객", scans: "QR 스캔", coupons: "쿠폰 수령", visits: "매장 방문" }
  const rateNames = { audience: "", scans: "참여율", coupons: "수령률", visits: "방문율" }
  const top = Math.max(1, ...report.funnel.map((step) => step.count))
  return (
    <ol className="insight-funnel">
      {report.funnel.map((step) => (
        <li key={step.key}>
          <span className="insight-funnel-name">{t(names[step.key])}</span>
          <span aria-hidden="true" className="insight-funnel-bar">
            <span style={{ width: `${Math.max(2, (step.count / top) * 100)}%` }} />
          </span>
          <span className="insight-funnel-count">{number(step.count)}</span>
          <span className="insight-funnel-rate">
            {step.rate === null ? (
              <small>{t("목표 설정에서 적은 값")}</small>
            ) : (
              <>
                <strong>
                  {t(rateNames[step.key])} {step.rate}%
                </strong>
                <small>{benchmarkLine(step.benchmark)}</small>
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

// What each result cost, with the cost per visit and the ROAS against the
// other events.
export function Costs({ report }: { report: PremiumReport }) {
  const cost = (value: number | null) => (value === null ? "—" : fullWon(value))
  const items = [
    { label: t("도달 1,000명당"), value: cost(report.costs.perThousandReach) },
    { label: t("QR 스캔 1건당"), value: cost(report.costs.perScan) },
    { label: t("쿠폰 1장당"), value: cost(report.costs.perCoupon) },
    { label: t("매장 방문 1명당"), value: cost(report.costs.perVisit), note: benchmarkLine(report.costs.perVisitBenchmark, "원") },
  ]
  return (
    <>
      <dl className="insight-costs">
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              {item.value}
              {item.note && <small>{item.note}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="insight-note">
        {t("협찬액 {spend} 기준 · ROAS {line}", {
          spend: fullWon(report.spend),
          line: benchmarkLine(report.costs.roasBenchmark),
        })}
      </p>
    </>
  )
}

// When people came: scans by hour on the busiest day, each day of the
// window, and the days between taking a coupon and visiting.
export function Timing({ report }: { report: PremiumReport }) {
  const { hourly, peak, daily, lag } = report.time
  const day = peak?.date ?? report.event.date
  const hours = hourly.filter((item) => item.date === day)
  const hourTop = Math.max(1, ...hours.map((item) => item.scans))
  const dayTop = Math.max(1, ...daily.map((item) => item.scans + item.coupons + item.visits))
  const lagTop = Math.max(1, ...lag.days)
  return (
    <div className="insight-timing">
      <figure>
        <figcaption>
          {t("시간대별 QR 스캔")}
          <small>{peak ? t("가장 붐빈 시간 {hour}시 · {scans}건", { hour: peak.hour, scans: peak.scans }) : t("아직 스캔이 없어요")}</small>
        </figcaption>
        <div className="insight-columns">
          {hours.map((item) => (
            <span className={item.hour === peak?.hour ? "peak" : undefined} key={item.hour}>
              <i style={{ height: `${(item.scans / hourTop) * 100}%` }} />
              <small>{item.hour}</small>
            </span>
          ))}
        </div>
      </figure>
      <figure>
        <figcaption>
          {t("날짜별 기록")}
          <small>{t("스캔 · 쿠폰 · 방문")}</small>
        </figcaption>
        <div className="insight-columns stacked">
          {daily.map((item) => (
            <span key={item.date} title={item.date}>
              <i className="scans" style={{ height: `${(item.scans / dayTop) * 100}%` }} />
              <i className="coupons" style={{ height: `${(item.coupons / dayTop) * 100}%` }} />
              <i className="visits" style={{ height: `${(item.visits / dayTop) * 100}%` }} />
              <small>{item.date.slice(8)}</small>
            </span>
          ))}
        </div>
      </figure>
      <figure>
        <figcaption>
          {t("쿠폰을 받고 방문하기까지")}
          <small>
            {lag.average === null
              ? t("쿠폰과 방문이 이어진 기록이 아직 없어요")
              : t("평균 {days}일 · 방문 {count}건 기준", { days: lag.average, count: lag.sample })}
          </small>
        </figcaption>
        <div className="insight-columns">
          {lag.days.map((count, index) => (
            <span key={index}>
              <i style={{ height: `${(count / lagTop) * 100}%` }} />
              <small>{index === 0 ? t("당일") : t("{days}일", { days: index })}</small>
            </span>
          ))}
        </div>
      </figure>
    </div>
  )
}

// The effect over the store's usual days, from its own counts, or the form
// to write them (only the brand, on its own report).
export function Effect({
  report,
  onSave,
}: {
  report: PremiumReport
  onSave?: (body: { before: number; during: number }) => Promise<boolean>
}) {
  const [draft, setDraft] = useState({
    before: report.effect ? String(report.effect.before) : "",
    during: report.effect ? String(report.effect.during) : "",
  })
  const [editing, setEditing] = useState(!report.effect)
  const effect = report.effect
  return (
    <>
      {effect && !(editing && onSave) && (
        <dl className="insight-effect">
          <div>
            <dt>{t("평소 대비 방문")}</dt>
            <dd>
              {effect.lift > 0 ? "+" : ""}
              {effect.lift}%<small>{t("하루 {before}명 → {during}명", { before: effect.before, during: effect.during })}</small>
            </dd>
          </div>
          <div>
            <dt>{t("늘어난 방문객")}</dt>
            <dd>
              {t("{count}명", { count: number(effect.extraVisitors) })}
              <small>{t("쿠폰 기간 {days}일 동안", { days: effect.days })}</small>
            </dd>
          </div>
          <div>
            <dt>{t("증분 ROAS")}</dt>
            <dd>
              {effect.incrementalRoas}%<small>{t("늘어난 매출 {sales}", { sales: fullWon(effect.extraSales) })}</small>
            </dd>
          </div>
          <div>
            <dt>{t("쿠폰이 설명하는 몫")}</dt>
            <dd>
              {effect.attributedShare === null ? "—" : `${effect.attributedShare}%`}
              <small>{t("늘어난 방문 중 쿠폰으로 확인된 방문")}</small>
            </dd>
          </div>
        </dl>
      )}
      {onSave && editing ? (
        <form
          className="insight-effect-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave({ before: Number(draft.before), during: Number(draft.during) }).then((saved) => saved && setEditing(false))
          }}
        >
          <label>
            {t("협찬 전 같은 요일 하루 방문객")}
            <input inputMode="decimal" onChange={(event) => setDraft({ ...draft, before: event.target.value })} placeholder="30" value={draft.before} />
          </label>
          <label>
            {t("쿠폰 기간 하루 방문객")}
            <input inputMode="decimal" onChange={(event) => setDraft({ ...draft, during: event.target.value })} placeholder="42" value={draft.during} />
          </label>
          <p className="field-hint">
            {t("포스(POS)나 장부의 하루 평균을 적어 주세요. 협찬 전 4주의 같은 요일과, {start}부터 {end}까지를 비교해요.", {
              start: formatFullDate(report.event.window.start),
              end: formatFullDate(report.event.window.visitsEnd),
            })}
          </p>
          <button className="primary-button" type="submit">
            {t("효과 계산하기")}
          </button>
        </form>
      ) : onSave ? (
        <button className="subtle-link" onClick={() => setEditing(true)} type="button">
          <Icon name="edit" size={14} /> {t("방문객 수 고치기")}
        </button>
      ) : (
        !effect && <p className="insight-note">{t("브랜드가 매장의 평소 방문객 수를 아직 적지 않았어요.")}</p>
      )}
    </>
  )
}

// What each side promised in the e-contract and did, with how much proof.
export function Fulfillment({ report }: { report: PremiumReport }) {
  const { items, done, proof } = report.fulfillment
  if (items.length === 0) return <p className="insight-note">{t("임시 전자 계약서가 없는 협찬이에요.")}</p>
  const sides = [
    { side: "group" as const, name: report.sponsorship.groupName },
    { side: "brand" as const, name: report.sponsorship.brandName },
  ]
  return (
    <>
      <p className="insight-note">
        {t("약속한 일 {total}개 중 {done}개 완료 · 증빙 {proof}건", { total: items.length, done, proof })}
      </p>
      <div className="insight-fulfillment">
        {sides.map(({ side, name }) => (
          <ul aria-label={name} key={side}>
            <li className="insight-fulfillment-head">{name}</li>
            {items
              .filter((item) => item.side === side)
              .map((item) => (
                <li className={item.done ? "done" : undefined} key={item.label}>
                  <Icon name={item.done ? "check" : "close"} size={14} />
                  <span>{item.label}</span>
                  {item.proof > 0 && <small>{t("증빙 {count}", { count: item.proof })}</small>}
                </li>
              ))}
          </ul>
        ))}
      </div>
    </>
  )
}

// What the venue confirmed by the agreed methods, and the reviews.
export function VenueAndReviews({ report }: { report: PremiumReport }) {
  const counted = report.methods
    .map((kind) => ({ kind, info: methodInfo[kind] }))
    .filter(({ info }) => (report.venue[info.metric as keyof typeof report.venue] ?? 0) > 0)
  return (
    <div className="insight-venue">
      <div>
        <h3>{t("현장 확인 집계")}</h3>
        {counted.length === 0 ? (
          <p className="insight-note">{t("QR · 쿠폰 · 방문 밖의 현장 확인은 없었어요.")}</p>
        ) : (
          <ul>
            {counted.map(({ kind, info }) => (
              <li key={kind}>
                <span>{t(info.label)}</span>
                <strong>{number(report.venue[info.metric as keyof typeof report.venue] ?? 0)}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3>{t("서로 남긴 후기")}</h3>
        {report.reviews.length === 0 ? (
          <p className="insight-note">{t("아직 후기가 없어요. 행사 뒤 계약서에서 남길 수 있어요.")}</p>
        ) : (
          <ul className="insight-reviews">
            {report.reviews.map((review) => (
              <li key={review.side}>
                <span>
                  {review.side === "group" ? report.sponsorship.groupName : report.sponsorship.brandName}
                  <em aria-label={t("별 {count}개", { count: review.rating })}>{"★".repeat(review.rating)}</em>
                </span>
                {review.comment && <p>{review.comment}</p>}
                {review.tags.length > 0 && <small>{review.tags.map((tag) => t(tag)).join(" · ")}</small>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const adviceText: Record<string, string> = {
  "peak-hour": "가장 붐빈 시간은 {hour}시예요. 다음 행사에서는 이 시간 앞뒤로 부스 인원과 QR 안내를 모아 주세요.",
  "raise-scans": "QR 참여율이 {rate}%로 목표 {target}%에 못 미쳤어요. 입구와 무대 멘트로 QR을 안내하고, 스캔하면 바로 받는 혜택을 앞에 보여 주세요.",
  "coupon-appeal": "스캔한 사람 중 {rate}%만 쿠폰을 받았어요. 혜택을 더 크게 보이게 하거나 바로 쓸 수 있는 혜택으로 바꿔 보세요.",
  "visit-nudge": "쿠폰을 받은 사람 중 {rate}%가 매장에 왔어요. 매장 위치 안내와 사용 기한 알림을 더하면 방문이 늘어요.",
  "shorter-window": "쿠폰을 받고 평균 {days}일 뒤에 방문했어요. 사용 기한을 짧게 정하면 행사 직후로 방문이 모여요.",
  renew: "ROAS {roas}%로 목표를 넘었어요. 같은 단체의 다음 행사에 다시 협찬하기 좋아요.",
  budget: "이번 방문 수로 목표 ROAS를 맞추는 협찬액은 {value} 정도예요. 다음 협찬액을 정할 때 기준으로 삼아 보세요.",
  "add-baseline": "매장의 평소 하루 방문객과 쿠폰 기간 하루 방문객을 적으면, 쿠폰 밖까지 포함한 평소 대비 효과를 계산해 드려요.",
}

export function Advice({ report, onOpenGroup }: { report: PremiumReport; onOpenGroup?: (id: string) => void }) {
  return (
    <div className="insight-advice">
      <ol>
        {report.advice
          .filter((item) => adviceText[item.code])
          .map((item) => {
            const values = { ...item.values }
            if (item.code === "budget" && typeof values.value === "number") values.value = fullWon(values.value)
            return <li key={item.code}>{t(adviceText[item.code], values)}</li>
          })}
      </ol>
      {report.next.length > 0 && (
        <>
          <h3>{t("다음에 함께하기 좋은 단체")}</h3>
          <ul className="insight-next">
            {report.next.map((group) => (
              <li key={group.id}>
                <span className="insight-next-score">{group.score}</span>
                <span>
                  <strong>{group.name}</strong>
                  <small>
                    {[group.school, t(group.category)].filter(Boolean).join(" · ")}
                    {group.event && ` · ${group.event.name} ${formatFullDate(group.event.date)}`}
                  </small>
                </span>
                {onOpenGroup && (
                  <button className="subtle-link" onClick={() => onOpenGroup(group.id)} type="button">
                    {t("프로필")} <Icon name="chevron" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// How the figures were made, so the report can be checked.
export function Methodology({ report }: { report: PremiumReport }) {
  return (
    <div className="insight-method">
      <ul>
        <li>{t("QR 스캔은 행사 고유 QR로 들어온 참여자 수예요. 한 휴대폰은 한 번만 세요.")}</li>
        <li>{t("쿠폰 수령은 참여자가 받은 이 브랜드 쿠폰 수, 매장 방문은 매장 직원이 매장 PIN으로 확인한 쿠폰 사용 수예요.")}</li>
        <li>
          {t("추정 매출 = 매장 방문 × 1인 예상 지출 {spend}(학생단체가 목표 설정에서 적은 값). 추정 ROAS = 추정 매출 ÷ 협찬액이에요.", {
            spend: fullWon(report.averageSpend),
          })}
        </li>
        <li>{t("도달 = QR 스캔 + 현장 밖 도달(SNS 등) {sns}명이에요.", { sns: number(report.snsReach) })}</li>
        <li>
          {t("비교는 uniconnect에서 측정을 마친 다른 행사 {count}건과 해요. 3건이 안 되면 비교하지 않아요.", {
            count: report.benchmarkCount,
          })}
        </li>
        <li>
          {t("날짜 · 시간 분석은 최근 기록 {count}건으로 해요. 평소 대비 효과는 브랜드가 적은 매장 방문객 수로 계산한 추정이에요.", {
            count: report.time.recordsKept,
          })}
        </li>
        <li>
          {t("측정 기간 {period} · 쿠폰 방문은 {end}까지", {
            period: formatPeriod(report.event.window.start, report.event.window.end),
            end: formatFullDate(report.event.window.visitsEnd),
          })}
        </li>
      </ul>
      <p className="insight-stamp">
        {t("리포트 번호 {number} · {time} 발행", { number: report.number, time: formatDateTime(report.issuedAt) })}
        {!report.final && ` · ${t("{date}에 최종 확정", { date: formatFullDate(report.finalOn) })}`}
      </p>
    </div>
  )
}
