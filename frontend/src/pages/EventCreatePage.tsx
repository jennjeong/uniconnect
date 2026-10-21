import { useState } from "react"

import type { EventDraft } from "../api"
import { DatePicker } from "../components/DatePicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { formatFullDate } from "../lib/date"
import type { Role } from "../types"

// Keep the values in sync with sponsorTypes in backend/src/lib/validation.ts.
// Student groups pick what they want; brands pick what they offer.
const sponsorOptions: Record<Role, { value: string; caption: string }[]> = {
  학생단체: [
    { value: "현금", caption: "행사 운영비 지원" },
    { value: "제품", caption: "음료 · 간식 · 굿즈 같은 현물" },
    { value: "서비스", caption: "촬영 · 디자인 · 장소 지원" },
    { value: "기타", caption: "원하는 협찬을 직접 적어 주세요" },
  ],
  브랜드: [
    { value: "현금", caption: "행사 운영비 후원" },
    { value: "제품", caption: "자사 제품 · 시음 · 샘플링" },
    { value: "서비스", caption: "매장 공간 · 촬영 · 디자인 지원" },
    { value: "기타", caption: "제공할 협찬을 직접 적어 주세요" },
  ],
}

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
  const noun = students ? "행사" : "캠페인"
  const [name, setName] = useState("")
  const [people, setPeople] = useState("")
  // Digits only; brands plan a budget in won.
  const [budget, setBudget] = useState("")
  const [date, setDate] = useState(initialDate)
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
      ? `${noun}명을 입력해 주세요.`
      : types.length === 0
        ? students
          ? "원하는 협찬 유형을 하나 이상 골라 주세요."
          : "제공할 협찬 형태를 하나 이상 골라 주세요."
        : wantsOther && !typeNote.trim()
          ? "기타 협찬 유형을 적어 주세요."
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
        eyebrow={students ? "New event" : "New campaign"}
        title={`새 ${noun} 등록`}
        description={`${noun} 정보를 알려 주시면 잘 맞는 ${students ? "브랜드" : "학생단체"}를 찾아 드려요.`}
      />

      <div className="create-layout">
        <div className="create-column">
          <div className="form-card">
            <h3 className="form-card-title">기본 정보</h3>
            <label className="field">
              <span>{noun}명</span>
              <input
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder={students ? "예) 2026 뮤즈 종강 공연" : "예) 11월 캠퍼스 시음회"}
                value={name}
              />
            </label>
            <label className="field">
              <span>{students ? "예상 참여 인원" : "목표 도달 인원"}</span>
              <div className="input-suffix">
                <input
                  inputMode="numeric"
                  onChange={(event) => setPeople(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={students ? "예) 120" : "예) 300"}
                  value={people}
                />
                <em>명</em>
              </div>
            </label>
            {!students && (
              <label className="field">
                <span>예산</span>
                <div className="input-suffix">
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setBudget(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))
                    }
                    placeholder="예) 800,000"
                    value={budget ? Number(budget).toLocaleString("ko-KR") : ""}
                  />
                  <em>원</em>
                </div>
              </label>
            )}
          </div>

          <div aria-labelledby="sponsor-type-title" className="form-card" role="group">
            <h3 className="form-card-title" id="sponsor-type-title">
              {students ? "원하는 협찬 유형" : "제공할 협찬 형태"}
            </h3>
            <p className="form-card-caption">여러 개를 고를 수 있어요.</p>
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
                      <strong>{option.value}</strong>
                      <small>{option.caption}</small>
                    </span>
                  </label>
                )
              })}
            </div>
            {types.includes("기타") && (
              <input
                aria-label="기타 협찬 유형"
                autoFocus
                className="other-input"
                maxLength={30}
                onChange={(event) => setTypeNote(event.target.value)}
                placeholder={students ? "예) 공연장 대관, 음향 장비" : "예) 매장 내 포스터 게시"}
                value={typeNote}
              />
            )}
          </div>
        </div>

        <div className="form-card date-card">
          <h3 className="form-card-title">일정</h3>
          <DatePicker value={date} onChange={setDate} />
          <p className="date-picked">
            <Icon name="calendar" size={16} />
            {formatFullDate(date)}
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
          취소
        </button>
        <button className="primary-button" disabled={busy} onClick={submit} type="button">
          {students ? "등록하고 매칭 받기" : "등록하고 단체 추천 받기"}
        </button>
      </div>
    </section>
  )
}
