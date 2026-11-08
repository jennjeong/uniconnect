import { useState } from "react"

import { errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { sponsorOptions } from "../data/sponsorTypes"
import { t } from "../i18n"
import { formatFullDate, formatPeriod, todayIso } from "../lib/date"
import type { EventItem, Match, ProposalTemplate, ProposalTermsDraft, Role } from "../types"

// 서버가 받는 형식(routes/proposals.ts, routes/auth.ts).
const maxMessage = 300
const maxTemplates = 10

// 나가는 대로의 저장된 메시지: {상대}는 파트너의 이름, {행사}는 행사의 이름이
// 된다.
export const fillTemplate = (text: string, partner: string, event: string) =>
  text.split("{상대}").join(partner).split("{행사}").join(event)

// 제안하기: 제안이 다루는 계정 자신의 행사나 캠페인(가까운 것이 먼저)과
// 파트너에게 보낼 메모. 쓴 대로 보내거나 비우면 기본 인사와 함께 보낸다.
// 파트너에게 받은함이 있는데 계정에 제안할 행사가 없으면 서버가 답하고, 그때는
// 쓴 내용이 남는다.
export function ProposeModal({
  match,
  targets,
  role,
  events,
  templates,
  onSaveTemplates,
  onClose,
  onSend,
  onCreate,
}: {
  match: Match
  // 일괄 제안: 제안 하나가 가는 모든 단체(match가 첫 번째). 메시지의 {상대}는
  // 나갈 때 각 단체의 이름으로 채워진다.
  targets?: Match[]
  role: Role
  events: EventItem[]
  // The account's saved messages (제안 문구 템플릿).
  templates: ProposalTemplate[]
  // 목록 전체를 저장한다. 공용 데모 계정에는 없다.
  onSaveTemplates?: (templates: ProposalTemplate[]) => Promise<void>
  onClose: () => void
  onSend: (draft: { eventId?: string; message: string; terms?: ProposalTermsDraft }) => Promise<void>
  // 제안할 행사가 없으면 먼저 행사를 등록한다.
  onCreate: () => void
}) {
  const students = role === "학생단체"
  const today = todayIso()
  const upcoming = events
    .filter((event) => (event.endDate ?? event.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const [eventId, setEventId] = useState(upcoming[0]?.id ?? "")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  // 목록에서 고른 템플릿과, 그 칸이 열려 있는 동안 새 템플릿으로 저장할 이름.
  const [picked, setPicked] = useState("")
  const [naming, setNaming] = useState<string | null>(null)
  const chosen = upcoming.find((event) => event.id === eventId)
  const eventName = chosen?.name ?? ""
  const partnerName = targets ? "{상대}" : match.name
  // 브랜드가 한 단체에 제안할 때, 그 단체의 다음 행사가 고른 캠페인 기간 밖이면
  // 알리고, 보내는 사람이 직접 고르게 한다: 이 날짜 그대로 진행할지, 다른 날짜로
  // 조정을 요청할지. 고른 것은 메시지가 아니라 조건(terms.schedule)으로 남는다.
  const partnerEvent = !students && !targets && match.eventDate ? { name: match.eventName ?? "", date: match.eventDate } : null
  const mismatch = Boolean(
    partnerEvent && chosen && (partnerEvent.date < chosen.date || partnerEvent.date > (chosen.endDate ?? chosen.date)),
  )
  const [dateChoice, setDateChoice] = useState<"" | "keep" | "adjust">("")
  const [adjustTo, setAdjustTo] = useState("")

  // 제안 조건. 고른 행사 · 캠페인의 협찬 형태와 예산으로 시작하고 이 제안에서 고친다.
  const [kinds, setKinds] = useState<string[]>(chosen?.types ?? [])
  // 예산이 협찬액의 범위(1만 원 ~ 1억 원) 안일 때만 금액으로 가져온다.
  const budgetAmount = (event?: EventItem) =>
    event?.budget && event.budget >= 10_000 && event.budget <= 100_000_000 ? String(event.budget) : ""
  const [amount, setAmount] = useState(budgetAmount(chosen))
  const [quantity, setQuantity] = useState("")
  const [deliverBy, setDeliverBy] = useState("")
  const [benefits, setBenefits] = useState("")
  const [respondBy, setRespondBy] = useState("")
  const pickEvent = (id: string) => {
    setEventId(id)
    const next = upcoming.find((event) => event.id === id)
    setKinds(next?.types ?? [])
    setAmount(budgetAmount(next))
    setDateChoice("")
  }
  const terms: ProposalTermsDraft = {
    ...(kinds.length ? { kinds } : {}),
    ...(amount.trim() ? { amount: Number(amount.replace(/[^\d]/g, "")) } : {}),
    ...(quantity.trim() ? { quantity: quantity.trim() } : {}),
    ...(deliverBy ? { deliverBy } : {}),
    ...(benefits.trim() ? { benefits: benefits.trim() } : {}),
    ...(respondBy ? { respondBy } : {}),
    ...(mismatch && dateChoice === "adjust" ? { schedule: { adjust: true, date: adjustTo } } : {}),
  }
  const lastDay = chosen ? (chosen.endDate ?? chosen.date) : undefined

  const saveTemplates = async (next: ProposalTemplate[]) => {
    if (!onSaveTemplates) return
    setError("")
    try {
      await onSaveTemplates(next)
      return true
    } catch (problem) {
      setError(errorMessage(problem))
      return false
    }
  }

  const send = async () => {
    if (busy) return
    if (mismatch && !dateChoice) {
      setError(t("날짜가 달라요. 이 날짜로 진행할지, 날짜 조정을 요청할지 골라 주세요."))
      return
    }
    if (mismatch && dateChoice === "adjust" && !adjustTo) {
      setError(t("조정하고 싶은 날짜를 골라 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      await onSend({ ...(eventId ? { eventId } : {}), message: message.trim(), ...(Object.keys(terms).length ? { terms } : {}) })
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      kicker="Proposal"
      name={targets ? "propose-many" : "propose"}
      onClose={onClose}
      title={targets ? t("{count}곳에 협찬 제안", { count: targets.length }) : t("{name}에 협찬 제안", { name: match.name })}
    >
      {targets && <p className="auth-lead bulk-names">{targets.map((target) => target.name).join(", ")}</p>}
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        {upcoming.length > 0 ? (
          <label>
            {students ? t("제안할 행사") : t("제안할 캠페인")}
            <select onChange={(event) => pickEvent(event.target.value)} value={eventId}>
              {upcoming.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {formatPeriod(event.date, event.endDate)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="propose-empty">
            <p className="auth-lead">
              {students
                ? t("다가오는 행사가 없어요. 가입한 브랜드에 제안하려면 먼저 행사를 등록해 주세요.")
                : t("다가오는 캠페인이 없어요. 가입한 학생단체에 제안하려면 먼저 캠페인을 등록해 주세요.")}
            </p>
            <button className="cancel-button" onClick={onCreate} type="button">
              {students ? t("행사 등록하기") : t("캠페인 등록하기")}
            </button>
          </div>
        )}
        {chosen && partnerEvent && (
          <div className={mismatch ? "propose-dates mismatch" : "propose-dates"}>
            <dl>
              <div>
                <dt>{t("우리 캠페인")}</dt>
                <dd>{formatPeriod(chosen.date, chosen.endDate)}</dd>
              </div>
              <div>
                <dt>{t("상대 행사")}</dt>
                <dd>
                  {partnerEvent.name && `${partnerEvent.name} · `}
                  {formatFullDate(partnerEvent.date)}
                </dd>
              </div>
            </dl>
            {mismatch && (
              <fieldset className="propose-date-choice">
                <legend>{t("캠페인 기간과 행사 날짜가 달라요. 어떻게 할까요?")}</legend>
                <label className="check-row">
                  <input checked={dateChoice === "keep"} name="date-choice" onChange={() => setDateChoice("keep")} type="radio" />
                  {t("상대 행사 날짜에 맞춰 이대로 제안해요")}
                </label>
                <label className="check-row">
                  <input checked={dateChoice === "adjust"} name="date-choice" onChange={() => setDateChoice("adjust")} type="radio" />
                  {t("날짜 조정을 요청해요")}
                </label>
                {dateChoice === "adjust" && (
                  <label>
                    {t("바꾸고 싶은 날짜")}
                    <input min={today} onChange={(event) => setAdjustTo(event.target.value)} type="date" value={adjustTo} />
                  </label>
                )}
              </fieldset>
            )}
          </div>
        )}
        {chosen && (
          <fieldset className="propose-terms">
            <legend>{t("제안 조건")}</legend>
            <p className="field-hint">
              {t("{name}에서 가져왔어요. 이 제안에 맞게 고치면 받는 쪽과 계약서에 그대로 보여요.", { name: chosen.name })}
            </p>
            <div className="propose-kinds" role="group" aria-label={t("협찬 형태")}>
              {sponsorOptions[role].map((option) => (
                <label className={kinds.includes(option.value) ? "chip-check checked" : "chip-check"} key={option.value}>
                  <input
                    checked={kinds.includes(option.value)}
                    onChange={() =>
                      setKinds((current) =>
                        current.includes(option.value) ? current.filter((kind) => kind !== option.value) : [...current, option.value],
                      )
                    }
                    type="checkbox"
                  />
                  {t(option.value)}
                </label>
              ))}
            </div>
            <div className="propose-terms-grid">
              <label>
                {t("금액(원)")}
                <input
                  aria-describedby="propose-amount-hint"
                  inputMode="numeric"
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder="300000"
                  value={amount}
                />
                <small className="field-hint" id="propose-amount-hint">
                  {t("1만 원 ~ 1억 원 · 계약서의 협찬액이 돼요")}
                </small>
              </label>
              <label>
                {t("내용 · 수량")}
                <input maxLength={40} onChange={(event) => setQuantity(event.target.value)} placeholder={t("예) 립밤 샘플 200개")} value={quantity} />
              </label>
              <label>
                {t("전달 기한")}
                <input max={lastDay} min={today} onChange={(event) => setDeliverBy(event.target.value)} type="date" value={deliverBy} />
              </label>
              <label>
                {t("응답 기한")}
                <input max={chosen.date} min={today} onChange={(event) => setRespondBy(event.target.value)} type="date" value={respondBy} />
              </label>
            </div>
            <label>
              {students ? t("브랜드에게 드리는 혜택") : t("단체에게 바라는 혜택")}
              <input
                maxLength={200}
                onChange={(event) => setBenefits(event.target.value)}
                placeholder={students ? t("예) 부스 로고 노출 · SNS 게시물 1회") : t("예) 부스 로고 노출 · 참여자 설문")}
                value={benefits}
              />
            </label>
          </fieldset>
        )}
        {(templates.length > 0 || onSaveTemplates) && (
          <div className="propose-templates">
            {templates.length > 0 && (
              <>
                <label>
                  <span className="sr-only">{t("저장한 문구")}</span>
                  <select
                    aria-label={t("저장한 문구")}
                    onChange={(event) => {
                      setPicked(event.target.value)
                      const template = templates.find((item) => item.id === event.target.value)
                      if (template) setMessage(fillTemplate(template.text, partnerName, eventName).slice(0, maxMessage))
                    }}
                    value={picked}
                  >
                    <option value="">{t("저장한 문구 불러오기")}</option>
                    {templates.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                {picked && onSaveTemplates && (
                  <button
                    className="underline-link"
                    onClick={async () => {
                      if (await saveTemplates(templates.filter((item) => item.id !== picked))) setPicked("")
                    }}
                    type="button"
                  >
                    {t("이 문구 지우기")}
                  </button>
                )}
              </>
            )}
            {onSaveTemplates && naming === null && (
              <button
                className="underline-link"
                disabled={!message.trim() || templates.length >= maxTemplates}
                onClick={() => setNaming("")}
                type="button"
              >
                {templates.length >= maxTemplates ? t("문구는 {max}개까지 저장해요", { max: maxTemplates }) : t("지금 문구 저장")}
              </button>
            )}
          </div>
        )}
        {naming !== null && (
          <div className="propose-template-name">
            <label>
              {t("문구 이름")}
              <input
                autoFocus
                maxLength={30}
                onChange={(event) => setNaming(event.target.value)}
                placeholder={t("예) 카페 첫 제안")}
                value={naming}
              />
            </label>
            <button
              className="cancel-button"
              disabled={!naming.trim()}
              onClick={async () => {
                // 파트너와 행사의 이름은 빈칸으로 되돌려 저장한다. 다음 제안이
                // 제 이름을 채우도록 하기 위해서다.
                let text = message.trim()
                if (!targets && match.name) text = text.split(match.name).join("{상대}")
                if (eventName) text = text.split(eventName).join("{행사}")
                if (await saveTemplates([...templates, { id: "", name: naming.trim(), text }])) setNaming(null)
              }}
              type="button"
            >
              {t("저장")}
            </button>
            <button className="underline-link" onClick={() => setNaming(null)} type="button">
              {t("취소")}
            </button>
          </div>
        )}
        <label>
          {t("전할 메시지")}
          <textarea
            className="propose-message"
            maxLength={maxMessage}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("어떤 협찬을 바라는지, 함께하면 좋은 점을 적어 주세요.")}
            rows={4}
            value={message}
          />
        </label>
        <p className="field-hint">
          {t("{count}/{max}자 · 비워 두면 기본 인사말이 가요.", { count: message.length, max: maxMessage })}
        </p>
        {targets && (
          <p className="field-hint">{t("저장한 문구의 상대 이름 자리는 단체마다 그 단체 이름으로 바뀌어서 가요.")}</p>
        )}
        {onSaveTemplates && (
          <p className="field-hint">{t("문구를 저장하면 상대와 행사 이름은 빈칸이 되고 다음에 불러올 때 그 제안의 이름으로 채워져요.")}</p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("제안 보내기")}
        </button>
      </form>
    </Modal>
  )
}
