import { useState } from "react"

import type { EventDraft } from "../api"
import { DatePicker } from "../components/DatePicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { sponsorOptions } from "../data/sponsorTypes"
import { t, tc } from "../i18n"
import { formatPeriod } from "../lib/date"
import type { Role } from "../types"

// Full page for registering an event or campaign.
export function EventCreatePage({
  role,
  initialDate,
  onCancel,
  onSubmit,
}: {
  role: Role
  // "YYYY-MM-DD", usually the day picked on the calendar.
  initialDate: string
  onCancel: () => void
  onSubmit: (draft: EventDraft) => Promise<void>
}) {
  const students = role === "학생단체"
  const [name, setName] = useState("")
  const [people, setPeople] = useState("")
  // Digits only; brands plan a budget in won.
  const [budget, setBudget] = useState("")
  // The first day, and the last when it runs over several days.
  const [date, setDate] = useState(initialDate)
  const [endDate, setEndDate] = useState<string | undefined>()
  const [types, setTypes] = useState<string[]>([])
  const [typeNote, setTypeNote] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const toggleType = (type: string) =>
    setTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    )

  const submit = async () => {
    const wantsOther = types.includes("기타")
    const problem = !name.trim()
      ? students
        ? t("행사명을 입력해 주세요.")
        : t("캠페인명을 입력해 주세요.")
      : types.length === 0
        ? students
          ? t("원하는 협찬 유형을 하나 이상 골라 주세요.")
          : t("제공할 협찬 형태를 하나 이상 골라 주세요.")
        : wantsOther && !typeNote.trim()
          ? t("기타 협찬 유형을 적어 주세요.")
          : ""
    if (problem) {
      setError(problem)
      return
    }
    setError("")
    setBusy(true)
    try {
      await onSubmit({
        name: name.trim(),
        people: people ? `${Number(people).toLocaleString("ko-KR")}명` : "",
        date,
        endDate,
        types,
        typeNote: wantsOther ? typeNote.trim() : undefined,
        budget: !students && budget ? Number(budget) : undefined,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page-view create-view">
      <PageIntro
        onBack={onCancel}
        eyebrow={students ? "New Event" : "New Campaign"}
        title={students ? t("새 행사 등록") : t("새 캠페인 등록")}
        description={
          students
            ? t("행사 정보를 알려 주시면 잘 맞는 브랜드를 찾아 드려요.")
            : t("캠페인 정보를 알려 주시면 잘 맞는 학생단체를 찾아 드려요.")
        }
      />

      <div className="create-layout">
        <div className="create-column">
          <div className="form-card">
            <h3 className="form-card-title">{t("기본 정보")}</h3>
            <label className="field">
              <span>{students ? t("행사명") : t("캠페인명")}</span>
              <input
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder={students ? t("예) 2026 뮤즈 종강 공연") : t("예) 11월 캠퍼스 시음회")}
                value={name}
              />
            </label>
            <label className="field">
              <span>{students ? t("예상 참여 인원") : t("목표 도달 인원")}</span>
              <div className="input-suffix">
                <input
                  inputMode="numeric"
                  onChange={(event) => setPeople(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={students ? t("예) 120") : t("예) 300")}
                  value={people}
                />
                <em>{t("명")}</em>
              </div>
            </label>
            {!students && (
              <label className="field">
                <span>{t("예산")}</span>
                <div className="input-suffix">
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setBudget(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))
                    }
                    placeholder={t("예) 800,000")}
                    value={budget ? Number(budget).toLocaleString("ko-KR") : ""}
                  />
                  <em>{t("원")}</em>
                </div>
              </label>
            )}
          </div>

          <div aria-labelledby="sponsor-type-title" className="form-card" role="group">
            <h3 className="form-card-title" id="sponsor-type-title">
              {students ? t("원하는 협찬 유형") : t("제공할 협찬 형태")}
            </h3>
            <p className="form-card-caption">{t("여러 개를 고를 수 있어요.")}</p>
            <div className="check-list stagger">
              {sponsorOptions[role].map((option) => {
                const checked = types.includes(option.value)
                return (
                  <label className={checked ? "check-row checked" : "check-row"} key={option.value}>
                    <input
                      checked={checked}
                      onChange={() => toggleType(option.value)}
                      type="checkbox"
                    />
                    <span aria-hidden="true" className="check-box">
                      <Icon name="check" size={14} />
                    </span>
                    <span className="check-copy">
                      <strong>{t(option.value)}</strong>
                      <small>{t(option.caption)}</small>
                    </span>
                  </label>
                )
              })}
            </div>
            {types.includes("기타") && (
              <input
                aria-label={t("기타 협찬 유형")}
                autoFocus
                className="other-input"
                maxLength={30}
                onChange={(event) => setTypeNote(event.target.value)}
                placeholder={students ? t("예) 공연장 대관, 음향 장비") : t("예) 매장 내 포스터 게시")}
                value={typeNote}
              />
            )}
          </div>
        </div>

        <div className="form-card date-card">
          <h3 className="form-card-title">{tc("heading", "일정")}</h3>
          <p className="form-card-caption">
            {t("첫날과 마지막 날을 차례로 누르면 기간으로 잡혀요. 하루 일정은 한 번만 누르세요.")}
          </p>
          <DatePicker
            end={endDate}
            onChange={(start, end) => {
              setDate(start)
              setEndDate(end)
            }}
            start={date}
          />
          <p className="date-picked">
            <Icon name="calendar" size={16} />
            {formatPeriod(date, endDate)}
          </p>
        </div>
      </div>

      {error && (
        <p className="form-error create-error" role="alert">
          {error}
        </p>
      )}
      <div className="create-actions">
        <button className="cancel-button" onClick={onCancel} type="button">
          {t("취소")}
        </button>
        <button className="primary-button" disabled={busy} onClick={submit} type="button">
          {students ? t("등록하고 매칭 받기") : t("등록하고 단체 추천 받기")}
        </button>
      </div>
    </section>
  )
}
