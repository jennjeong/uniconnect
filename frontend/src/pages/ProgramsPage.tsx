import { lazy, Suspense, useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { DemoPreview } from "../components/DemoPreview"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { Presence } from "../components/Presence"
import { exampleProgram, exampleProgramReport, programSchoolLabels, programStatusLabels, programSteps } from "../data/programs"
import { regions } from "../data/universities"
import { t, tc } from "../i18n"
import { formatDateTime, formatDay, monthLabel, todayIso } from "../lib/date"
import { saveFile } from "../lib/download"
import { formatWon } from "../lib/kpis"
import { programReportCsv } from "../lib/programReport"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { Program, ProgramBrief, ProgramReport, ProgramSchool } from "../types"

// 캠퍼스 캠페인(/programs, /programs/<id>): 브랜드가 여러 대학 행사에서 한 번에 집행할
// 캠페인을 요청하고, 운영자의 견적을 보고 운영비를 결제하고, 진행 단계를 본다. 실비는
// 금액만 보이고 브랜드가 단체와 업체에 직접 낸다. 방문자와 데모 계정은 예시를 본다.
type Props = {
  id?: string
  // 예시를 보여 줄지다. 방문자이거나 데모 계정이다.
  sample: boolean
  // 로그인한 데모 계정이다. 예시와 함께 직접 요청할 수 없다고 알린다.
  demo: boolean
  brand: boolean
  onOpen: (id: string) => void
  onBack: () => void
  onNotice: (message: string) => void
  onLogin: () => void
  onSignup: () => void
  // 고른 후보 단체에 캠페인 제안을 보내는 폼을 연다(App의 일괄 제안, #402).
  onPropose?: (groupIds: string[], programId: string) => void
  // 제안을 보낸 뒤 늘어나 학교들의 상태를 다시 읽는다.
  tick?: number
  // PDF 보고서에 적는 작성자(브랜드 이름)다.
  author: string
}

const ProgramReportExport = lazy(() => import("../report/ProgramReportExport").then((module) => ({ default: module.ProgramReportExport })))

// 한 번에 제안을 보내는 단체의 수다(단체 찾기의 maxBulk와 같다).
const maxPick = 10

const thisMonth = () => todayIso().slice(0, 7)

const period = (brief: ProgramBrief) =>
  brief.from === brief.to ? monthLabel(brief.from, true) : `${monthLabel(brief.from, true)} – ${monthLabel(brief.to, true)}`

export function ProgramsPage(props: Props) {
  const { id, sample, demo, brand, onBack, onLogin, onSignup } = props
  if (!brand) {
    return (
      <section className="page-view programs-page">
        <PageIntro onBack={onBack} eyebrow={tc("eyebrow", "캠퍼스 캠페인")} title={t("캠퍼스 캠페인")} description={t("브랜드 계정에서 쓸 수 있어요.")} />
      </section>
    )
  }
  const note = (
    <DemoPreview
      active={sample}
      title={demo ? t("데모 계정은 예시만 볼 수 있어요") : t("예시 캠페인이에요")}
      text={t("브랜드 회원으로 가입하면, 요청서를 내고 견적을 받을 수 있어요.")}
      onLogin={onLogin}
      onSignup={onSignup}
    >
      {id ? <ProgramDetail key={String(sample)} {...props} id={id} /> : <ProgramList key={String(sample)} {...props} />}
    </DemoPreview>
  )
  return <section className="page-view programs-page">{note}</section>
}

function ProgramList({ sample, onOpen, onBack, onNotice }: Props) {
  const [programs, setPrograms] = useState<Program[] | null>(sample ? [exampleProgram(thisMonth())] : null)
  const [failed, setFailed] = useState("")
  const [writing, setWriting] = useState(false)

  useEffect(() => {
    if (sample) return
    api.programs().then((result) => setPrograms(result.programs), (error: unknown) => setFailed(errorMessage(error)))
  }, [sample])

  return (
    <>
      <PageIntro
        onBack={onBack}
        eyebrow={tc("eyebrow", "캠퍼스 캠페인")}
        title={t("여러 학교에 한 번에")}
        description={t("지역, 기간, 학교 수를 적어 요청하면, 운영팀이 견적을 보내요. 운영비만 결제하고, 섭외부터 결과 보고까지 맡겨요.")}
        actions={
          !sample && (
            <Pill onClick={() => setWriting((open) => !open)} aria-expanded={writing}>
              {writing ? t("요청서 닫기") : t("캠페인 요청하기")}
            </Pill>
          )
        }
      />
      {writing && (
        <ProgramForm
          onDone={(program) => {
            setWriting(false)
            setPrograms((list) => [program, ...(list ?? [])])
            onNotice(t("요청서를 보냈어요. 견적이 나오면 알려 드릴게요."))
          }}
        />
      )}
      {failed && (
        <p className="form-error" role="alert">
          {failed}
        </p>
      )}
      {programs === null && !failed && <p className="programs-empty">{t("불러오고 있어요…")}</p>}
      {programs?.length === 0 && <p className="programs-empty">{t("아직 요청한 캠페인이 없어요.")}</p>}
      {programs && programs.length > 0 && (
        <ul className="programs-list" aria-label={t("요청한 캠페인")}>
          {programs.map((program) => (
            <li key={program.id}>
              <button className="programs-item" onClick={() => onOpen(program.id)} type="button">
                <span>
                  <strong>{program.brief.name}</strong>
                  <small>
                    {[period(program.brief), t("{count}개 학교", { count: program.brief.schools }), program.brief.regions.map((region) => t(region)).join(" · ")]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <em className={`programs-status status-${programSteps.indexOf(program.status)}`}>{t(programStatusLabels[program.status])}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ProgramForm({ onDone }: { onDone: (program: Program) => void }) {
  const month = thisMonth()
  const [brief, setBrief] = useState({ name: "", product: "", regions: [] as string[], from: month, to: month, schools: "5", perSchool: "", audience: "", asks: "", budget: "" })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const set = (key: keyof typeof brief) => (event: { target: { value: string } }) => setBrief((value) => ({ ...value, [key]: event.target.value }))
  const toggle = (region: string) =>
    setBrief((value) => ({ ...value, regions: value.regions.includes(region) ? value.regions.filter((item) => item !== region) : [...value.regions, region] }))

  const submit = async () => {
    if (!brief.name.trim()) return setError(t("캠페인 이름을 적어 주세요."))
    if (!brief.product.trim()) return setError(t("알리려는 제품을 적어 주세요."))
    setBusy(true)
    setError("")
    try {
      const { program } = await api.createProgram({
        name: brief.name.trim(),
        product: brief.product.trim(),
        regions: brief.regions,
        from: brief.from,
        to: brief.to,
        schools: Number(brief.schools),
        perSchool: Number(brief.perSchool || 0),
        ...(brief.audience.trim() ? { audience: brief.audience.trim() } : {}),
        ...(brief.asks.trim() ? { asks: brief.asks.trim() } : {}),
        ...(brief.budget ? { budget: Number(brief.budget) } : {}),
      })
      onDone(program)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="auth-form programs-form"
      aria-label={t("캠페인 요청서")}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <label>
        {t("캠페인 이름")}
        <input maxLength={40} onChange={set("name")} required value={brief.name} />
      </label>
      <label>
        {t("알리려는 제품")}
        <input maxLength={100} onChange={set("product")} required value={brief.product} />
      </label>
      <fieldset className="programs-regions">
        <legend>{t("원하는 지역 (다섯 곳까지, 고르지 않으면 어디든)")}</legend>
        <div>
          {regions.map((region) => (
            <button
              aria-pressed={brief.regions.includes(region)}
              className="programs-chip"
              disabled={!brief.regions.includes(region) && brief.regions.length >= 5}
              key={region}
              onClick={() => toggle(region)}
              type="button"
            >
              {t(region)}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="programs-row">
        <label>
          {t("첫 달")}
          <input min={month} onChange={set("from")} type="month" value={brief.from} />
        </label>
        <label>
          {t("마지막 달")}
          <input min={brief.from} onChange={set("to")} type="month" value={brief.to} />
        </label>
      </div>
      <div className="programs-row">
        <label>
          {t("학교 수")}
          <input inputMode="numeric" max={50} min={1} onChange={set("schools")} type="number" value={brief.schools} />
        </label>
        <label>
          {t("학교당 수량")}
          <input inputMode="numeric" min={0} onChange={set("perSchool")} placeholder="300" type="number" value={brief.perSchool} />
        </label>
      </div>
      <label>
        {t("대상 학생 (선택)")}
        <input maxLength={100} onChange={set("audience")} placeholder={t("예: 1~2학년, 체육 전공")} value={brief.audience} />
      </label>
      <label>
        {t("원하는 홍보 방식과 요청 사항 (선택)")}
        <textarea maxLength={500} onChange={set("asks")} rows={3} value={brief.asks} />
      </label>
      <label>
        {t("전체 예산 (선택, 원)")}
        <input inputMode="numeric" min={0} onChange={set("budget")} type="number" value={brief.budget} />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy} type="submit">
        {busy ? t("보내는 중…") : t("요청서 보내기")}
      </button>
    </form>
  )
}

function ProgramDetail({ id, sample, onBack, onNotice, onPropose, tick, author }: Props & { id: string }) {
  const [program, setProgram] = useState<Program | null>(sample ? exampleProgram(thisMonth()) : null)
  const [failed, setFailed] = useState("")
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (sample) return
    api.program(id).then((result) => setProgram(result.program), (error: unknown) => setFailed(errorMessage(error)))
  }, [id, sample, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load])

  if (!program) {
    return <PageIntro onBack={onBack} eyebrow={tc("eyebrow", "캠퍼스 캠페인")} title={t("캠퍼스 캠페인")} description={failed || t("불러오고 있어요…")} />
  }
  const { brief, quote, status } = program
  const step = programSteps.indexOf(status)
  const withdraw = async () => {
    setBusy(true)
    try {
      setProgram((await api.withdrawProgram(program.id)).program)
      onNotice(t("캠페인 요청을 거뒀어요."))
    } catch (caught) {
      onNotice(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageIntro onBack={onBack} eyebrow={tc("eyebrow", "캠퍼스 캠페인")} title={brief.name} description={t(programStatusLabels[status])} />
      {status === "취소" ? (
        <p className="programs-canceled">{program.cancelReason ? t("취소된 캠페인이에요. 사유: {reason}", { reason: program.cancelReason }) : t("취소된 캠페인이에요.")}</p>
      ) : (
        <ol className="programs-steps" aria-label={t("진행 단계")}>
          {programSteps.map((item, index) => (
            <li aria-current={index === step ? "step" : undefined} className={index < step ? "done" : index === step ? "current" : undefined} key={item}>
              {t(programStatusLabels[item])}
            </li>
          ))}
        </ol>
      )}

      <div className="programs-cards">
        <section className="programs-card" aria-label={t("요청서")}>
          <h2>{t("요청서")}</h2>
          <dl>
            <dt>{t("제품")}</dt>
            <dd>{brief.product}</dd>
            <dt>{t("지역")}</dt>
            <dd>{brief.regions.length ? brief.regions.map((region) => t(region)).join(" · ") : t("어디든")}</dd>
            <dt>{t("기간")}</dt>
            <dd>{period(brief)}</dd>
            <dt>{t("학교 수")}</dt>
            <dd>{t("{count}개 학교", { count: brief.schools })}</dd>
            {brief.perSchool > 0 && (
              <>
                <dt>{t("학교당 수량")}</dt>
                <dd>{brief.perSchool.toLocaleString()}</dd>
              </>
            )}
            {brief.audience && (
              <>
                <dt>{t("대상")}</dt>
                <dd>{brief.audience}</dd>
              </>
            )}
            {brief.asks && (
              <>
                <dt>{t("요청 사항")}</dt>
                <dd>{brief.asks}</dd>
              </>
            )}
            {brief.budget !== undefined && (
              <>
                <dt>{t("예산")}</dt>
                <dd>{fullWon(brief.budget)}</dd>
              </>
            )}
          </dl>
        </section>

        <section className="programs-card" aria-label={t("견적")}>
          <h2>{t("견적")}</h2>
          {quote ? (
            <>
              <table className="programs-quote">
                <tbody>
                  <tr>
                    <th scope="row">{t("운영비 (uniconnect에 결제, 부가세 포함)")}</th>
                    <td>{fullWon(quote.feeWithVat)}</td>
                  </tr>
                  {quote.costs.map((cost) => (
                    <tr key={cost.label}>
                      <th scope="row">{t("실비: {label}", { label: cost.label })}</th>
                      <td>{fullWon(cost.amount)}</td>
                    </tr>
                  ))}
                  {quote.costs.length > 0 && (
                    <tr className="programs-quote-total">
                      <th scope="row">{t("총 지급 예정액 (운영비 부가세 포함 + 실비)")}</th>
                      <td>{fullWon(quote.feeWithVat + quote.costTotal)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {quote.costs.length > 0 && (
                <p className="programs-hint">
                  {t("실비 합계 {amount} · 브랜드가 행사 진행에 맞춰 단체와 업체에 직접 지급해요. uniconnect는 받지 않아요.", { amount: fullWon(quote.costTotal) })}
                </p>
              )}
              {quote.note && <p className="programs-hint">{quote.note}</p>}
            </>
          ) : (
            <p className="programs-hint">{t("운영팀이 요청서를 보고 견적을 준비하고 있어요.")}</p>
          )}
          {program.paidAt && <p className="programs-hint">{t("운영비를 결제했어요. 운영팀이 학교 섭외를 시작해요.")}</p>}
          {program.transferRequested && status === "견적" && <p className="programs-hint">{t("계좌 입금을 요청했어요. 입금이 확인되면 섭외를 시작해요.")}</p>}
          {!sample && (status === "견적" || status === "접수") && (
            <div className="programs-actions">
              {status === "견적" && quote && <Pill onClick={() => setPaying(true)}>{t("운영비 결제하기")}</Pill>}
              <Pill disabled={busy} onClick={() => void withdraw()} variant="outline">
                {t("요청 거두기")}
              </Pill>
            </div>
          )}
        </section>
      </div>

      {(status === "섭외 중" || status === "집행 중" || program.schools.length > 0) && (
        <ProgramSchools
          target={brief.schools}
          canSend={!sample && (status === "섭외 중" || status === "집행 중") && Boolean(onPropose)}
          onSend={(groupIds) => onPropose?.(groupIds, program.id)}
          schools={program.schools}
        />
      )}

      {program.schools.some((school) => reported.includes(school.state)) && (
        <ProgramResults author={author} key={`${program.id}-${tick ?? 0}`} onNotice={onNotice} program={program} sample={sample} />
      )}

      {quote && (
        <Presence show={paying}>
          <PaymentModal
            amount={quote.fee}
            kind="program"
            lines={[
              { label: t("상품"), value: t("캠퍼스 캠페인 운영비") },
              { label: t("캠페인"), value: brief.name },
            ]}
            onClose={() => setPaying(false)}
            onTransferAsked={() => {
              setPaying(false)
              onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 섭외를 시작해요."))
              load()
            }}
            targetId={program.id}
            title={t("캠퍼스 캠페인 결제")}
          />
        </Presence>
      )}
    </>
  )
}

// 캠페인의 학교들: 운영팀이 고른 후보와 보낸 제안이다. 브랜드는 후보를 골라 제안을 보내고,
// 학교마다 기존 계약서와 측정이 이어진다.
function ProgramSchools({ schools, target, canSend, onSend }: { schools: ProgramSchool[]; target: number; canSend: boolean; onSend: (groupIds: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([])
  const candidates = schools.filter((school) => school.state === "후보")
  // 목표에 모자란 학교 수: 계약했거나 행사를 마친 학교만 채운 것으로 센다(거절·마감·취소는 빠진다).
  const secured = schools.filter((school) => school.state === "수락" || school.state === "계약 확인" || school.state === "행사 완료").length
  const short = Math.max(0, target - secured)
  const live = picked.filter((id) => candidates.some((school) => school.groupId === id))
  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : current.length >= maxPick ? current : [...current, id]))
  return (
    <section className="programs-card programs-schools" aria-label={t("학교")}>
      <h2>{t("학교 {count}곳", { count: schools.length })}</h2>
      <p className="programs-tally">
        {t("목표 {target}곳 · 후보 {candidates} · 답 대기 {waiting} · 계약 {contracted} · 행사 완료 {done}", {
          target,
          candidates: candidates.length,
          waiting: schools.filter((school) => school.state === "대기").length,
          contracted: schools.filter((school) => school.state === "수락" || school.state === "계약 확인").length,
          done: schools.filter((school) => school.state === "행사 완료").length,
        })}
        {short > 0 && (
          <>
            {" · "}
            <strong>{t("아직 {count}곳 더 필요해요", { count: short })}</strong>
          </>
        )}
      </p>
      {schools.length === 0 ? (
        <p className="programs-hint">{t("운영팀이 후보 학교를 고르고 있어요. 준비되면 메일로 알려 드려요.")}</p>
      ) : (
        <>
          {canSend && candidates.length > 0 && (
            <p className="programs-hint">{t("제안을 보낼 후보를 골라 주세요. 한 번에 {count}곳까지예요.", { count: maxPick })}</p>
          )}
          <ul className="programs-school-list">
            {schools.map((school) => {
              const pickable = canSend && school.state === "후보"
              const body = (
                <>
                  <span className="programs-school-name">
                    <strong>{school.name}</strong>
                    <small>{school.school}</small>
                  </span>
                  {school.event && (
                    <span className="programs-school-event">
                      {school.event.name} · {formatDay(school.event.date)}
                    </span>
                  )}
                  {school.note && <span className="programs-school-note">{school.note}</span>}
                  <span className={`programs-school-state state-${programStateTone[school.state]}`}>{t(programSchoolLabels[school.state])}</span>
                </>
              )
              return (
                <li key={school.groupId}>
                  {pickable ? (
                    <label className="programs-school">
                      <input checked={live.includes(school.groupId)} disabled={!live.includes(school.groupId) && live.length >= maxPick} onChange={() => toggle(school.groupId)} type="checkbox" />
                      {body}
                    </label>
                  ) : (
                    <div className="programs-school">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
          {canSend && candidates.length > 0 && (
            <div className="programs-actions">
              <Pill disabled={live.length === 0} onClick={() => onSend(live)}>
                {live.length ? t("고른 {count}곳에 제안 보내기", { count: live.length }) : t("후보를 골라 주세요")}
              </Pill>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// 상태 칩의 색이다. 진행 중, 끝남, 멈춤으로 나눈다.
const programStateTone: Record<ProgramSchool["state"], "wait" | "go" | "done" | "stop"> = {
  후보: "wait",
  대기: "wait",
  수락: "go",
  "계약 확인": "go",
  "행사 완료": "done",
  거절: "stop",
  마감: "stop",
  취소: "stop",
}

// 결과를 보고하는 학교의 상태다(backend lib/programReport.ts와 같다).
const reported: ProgramSchool["state"][] = ["수락", "계약 확인", "행사 완료"]

// 캠페인의 통합 보고(#403): 합계, 학교별 이행과 측정, CSV와 PDF. 셋은 같은 보고에서 나온다.
function ProgramResults({ program, sample, author, onNotice }: { program: Program; sample: boolean; author: string; onNotice: (message: string) => void }) {
  const [report, setReport] = useState<ProgramReport | null>(sample ? exampleProgramReport(program.brief.from) : null)
  const [failed, setFailed] = useState("")
  const [exporting, setExporting] = useState(false)
  // 보고를 받은 때다(화면은 그때의 수치다).
  const [loadedAt, setLoadedAt] = useState(() => new Date().toISOString())
  useEffect(() => {
    if (sample) return
    api.programReport(program.id).then(
      (result) => {
        setReport(result.report)
        setLoadedAt(new Date().toISOString())
      },
      (error: unknown) => setFailed(errorMessage(error)),
    )
  }, [program.id, sample])
  const done = useCallback(
    (failedExport: boolean) => {
      setExporting(false)
      if (failedExport) onNotice(t("PDF를 만들지 못했어요. 잠시 뒤에 다시 시도해 주세요."))
    },
    [onNotice],
  )

  if (!report) {
    return (
      <section className="programs-card programs-results" aria-label={t("결과 보고")}>
        <h2>{t("결과 보고")}</h2>
        <p className="programs-hint">{failed || t("불러오고 있어요…")}</p>
      </section>
    )
  }
  const { totals } = report
  const shared = report.schools.some((row) => row.sharedWith > 1)
  // 행사를 아직 마치지 않았고 센 것이 없는 학교는 0이 아니라 집계 전이다.
  const pending = (row: ProgramReport["schools"][number]) => row.state !== "행사 완료" && row.coupons === 0 && row.visits === 0 && row.scans === 0
  const tiles = [
    { label: t("계약한 학교"), value: t("{count}곳", { count: totals.confirmed }), note: t("제안 {sent}곳 · 수락 {accepted}곳 · 행사 완료 {finished}곳", { sent: totals.sent, accepted: totals.accepted, finished: totals.finished }) },
    { label: t("매장 방문"), value: t("{visits}건", { visits: totals.visits.toLocaleString() }), note: t("쿠폰 {coupons}장 · QR {scans}회", { coupons: totals.coupons.toLocaleString(), scans: totals.scans.toLocaleString() }) },
    { label: t("방문 1건당 비용"), value: totals.costPerVisit === null ? "—" : formatWon(totals.costPerVisit), note: t("캠페인 비용 {cost} (운영비 부가세 별도 + 실비)", { cost: formatWon(totals.cost) }) },
    { label: t("단체 이행"), value: `${totals.itemsDone}/${totals.itemsTotal}`, note: t("증빙 {count}건 · 추정 매출 {sales}", { count: totals.proofs, sales: formatWon(totals.sales) }) },
  ]
  return (
    <section className="programs-card programs-results" aria-label={t("결과 보고")}>
      <h2>{program.status === "완료" ? t("최종 결과 보고") : t("중간 결과 보고")}</h2>
      <p className="programs-hint">
        {t("집계 대상 {count}곳 · {time} 기준", { count: report.schools.length, time: formatDateTime(loadedAt) })}
        {program.status !== "완료" && ` · ${t("행사를 마치지 않은 학교는 '집계 전'으로 보여요.")}`}
      </p>
      <ul className="programs-kpis">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>{tile.note}</small>
          </li>
        ))}
      </ul>
      <div className="programs-table-wrap" role="region" aria-label={t("학교별 결과")} tabIndex={0}>
        <table className="programs-report-table">
          <thead>
            <tr>
              <th scope="col">{t("학교")}</th>
              <th scope="col">{t("캠페인")}</th>
              <th scope="col">{t("상태")}</th>
              <th scope="col">{t("이행")}</th>
              <th scope="col">{t("증빙")}</th>
              <th scope="col">{t("쿠폰")}</th>
              <th scope="col">{t("방문")}</th>
              <th scope="col">{t("추정 매출")}</th>
            </tr>
          </thead>
          <tbody>
            {report.schools.map((row) => (
              <tr key={row.groupId}>
                <th scope="row">
                  {row.name}
                  <small>{row.school}</small>
                </th>
                <td>
                  {row.eventName}
                  {row.date && <small>{formatDay(row.date)}</small>}
                </td>
                <td>{t(programSchoolLabels[row.state])}</td>
                <td>
                  {row.itemsDone}/{row.itemsTotal}
                </td>
                <td>{row.proofs}</td>
                <td>{pending(row) ? t("집계 전") : row.coupons.toLocaleString()}</td>
                <td>{pending(row) ? t("집계 전") : row.visits.toLocaleString()}</td>
                <td>
                  {pending(row) ? t("집계 전") : formatWon(row.sales)}
                  {row.sharedWith > 1 && <small>{t("{count}곳 함께 집계", { count: row.sharedWith })}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shared && <p className="programs-hint">{t("같은 캠페인으로 보낸 학교들은 수치가 함께 집계돼요. 학교별로 보려면 학교마다 캠페인을 따로 등록해 보내 주세요.")}</p>}
      <div className="programs-actions">
        <Pill
          onClick={() => saveFile(`uniconnect-campaign-${sample ? "sample-" : ""}${todayIso()}.csv`, programReportCsv(program, report, { sample }), "text/csv;charset=utf-8")}
          variant="outline"
        >
          {t("CSV 내려받기")}
        </Pill>
        <Pill disabled={exporting} onClick={() => setExporting(true)} variant="outline">
          {exporting ? t("PDF 만드는 중…") : t("PDF 내려받기")}
        </Pill>
      </div>
      {exporting && (
        <Suspense fallback={null}>
          <ProgramReportExport author={author} onDone={done} program={program} report={report} sample={sample} />
        </Suspense>
      )}
    </section>
  )
}
