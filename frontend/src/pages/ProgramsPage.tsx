import { useCallback, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { DemoPreview } from "../components/DemoPreview"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { Presence } from "../components/Presence"
import { exampleProgram, programStatusLabels, programSteps } from "../data/programs"
import { regions } from "../data/universities"
import { t, tc } from "../i18n"
import { monthLabel, todayIso } from "../lib/date"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { Program, ProgramBrief } from "../types"

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
}

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

function ProgramDetail({ id, sample, onBack, onNotice }: Props & { id: string }) {
  const [program, setProgram] = useState<Program | null>(sample ? exampleProgram(thisMonth()) : null)
  const [failed, setFailed] = useState("")
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    if (sample) return
    api.program(id).then((result) => setProgram(result.program), (error: unknown) => setFailed(errorMessage(error)))
  }, [id, sample])
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
                </tbody>
              </table>
              {quote.costs.length > 0 && (
                <p className="programs-hint">{t("실비 {amount}는 단체와 업체에 직접 지급해요. uniconnect는 받지 않아요.", { amount: fullWon(quote.costTotal) })}</p>
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
