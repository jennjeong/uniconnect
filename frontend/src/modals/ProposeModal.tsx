import { useState } from "react"

import { errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { t } from "../i18n"
import { formatPeriod, todayIso } from "../lib/date"
import type { EventItem, Match, ProposalTemplate, Role } from "../types"

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
  onSend: (draft: { eventId?: string; message: string }) => Promise<void>
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
  const eventName = upcoming.find((event) => event.id === eventId)?.name ?? ""
  const partnerName = targets ? "{상대}" : match.name

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
    setBusy(true)
    setError("")
    try {
      await onSend({ ...(eventId ? { eventId } : {}), message: message.trim() })
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
            <select onChange={(event) => setEventId(event.target.value)} value={eventId}>
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
