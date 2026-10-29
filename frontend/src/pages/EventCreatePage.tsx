import { useState } from "react"

import type { EventDraft } from "../api"
import { DatePicker } from "../components/DatePicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { sponsorOptions } from "../data/sponsorTypes"
import { t, tc } from "../i18n"
import { formatPeriod, todayIso } from "../lib/date"
import type { EventItem, Role, SponsorPackage } from "../types"

// Full page for registering an event or campaign, or editing one.
export function EventCreatePage({
  role,
  event,
  initialDate,
  onCancel,
  onSubmit,
}: {
  role: Role
  // The event or campaign being edited; a new one when absent.
  event?: EventItem
  // "YYYY-MM-DD", usually the day picked on the calendar.
  initialDate: string
  onCancel: () => void
  onSubmit: (draft: EventDraft) => Promise<void>
}) {
  const students = role === "학생단체"
  const editing = event !== undefined
  // Its dates stay once it has begun, as its results were counted on them.
  const datesLocked = editing && event.date <= todayIso()
  const [name, setName] = useState(event?.name ?? "")
  // Digits only, from "1,234명".
  const [people, setPeople] = useState(event?.people.replace(/\D/g, "") ?? "")
  // Digits only; brands plan a budget in won.
  const [budget, setBudget] = useState(event?.budget === undefined ? "" : String(event.budget))
  // The first day, and the last when it runs over several days.
  const [date, setDate] = useState(event?.date ?? initialDate)
  const [endDate, setEndDate] = useState<string | undefined>(event?.endDate)
  const [types, setTypes] = useState<string[]>(event?.types ?? [])
  const [typeNote, setTypeNote] = useState(event?.typeNote ?? "")
  // A group's event page: where, what it is, and the packages it offers.
  const [venue, setVenue] = useState(event?.venue ?? "")
  const [intro, setIntro] = useState(event?.intro ?? "")
  const [packages, setPackages] = useState<SponsorPackage[]>(event?.packages ?? [])
  const changePackage = (index: number, part: keyof SponsorPackage, value: string) =>
    setPackages((current) => current.map((item, at) => (at === index ? { ...item, [part]: value } : item)))
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const toggleType = (type: string) =>
    setTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    )

  const submit = async () => {
    const wantsOther = types.includes("기타")
    // Rows left empty are dropped; one begun needs its name and what the brand gets.
    const filled = packages
      .map((item) => ({ name: item.name.trim(), gives: item.gives.trim(), asks: item.asks.trim() }))
      .filter((item) => item.name || item.gives || item.asks)
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
          : filled.some((item) => !item.name || !item.gives)
            ? t("혜택 묶음마다 이름과 브랜드가 받는 것을 적어 주세요.")
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
        ...(students ? { venue: venue.trim(), intro: intro.trim(), packages: filled } : {}),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="page-view create-view">
      <PageIntro
        onBack={onCancel}
        eyebrow={editing ? (students ? "Edit Event" : "Edit Campaign") : students ? "New Event" : "New Campaign"}
        title={
          editing ? (students ? t("행사 수정") : t("캠페인 수정")) : students ? t("새 행사 등록") : t("새 캠페인 등록")
        }
        description={
          editing
            ? t("바꾼 내용은 이 일정에 대한 제안과 협찬에도 반영되고, 상대에게 메일로 알려요.")
            : students
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
          {students && (
            <div className="form-card event-page-card">
              <h3 className="form-card-title">{t("행사 페이지")}</h3>
              <p className="form-card-caption">{t("브랜드가 행사를 판단하도록 장소와 소개, 협찬 혜택 묶음을 적어 주세요. 사진은 행사 상세에서 올려요.")}</p>
              <label className="field">
                <span>{t("장소")}</span>
                <input
                  maxLength={60}
                  onChange={(changed) => setVenue(changed.target.value)}
                  placeholder={t("예) 삼육대학교 대강당")}
                  value={venue}
                />
              </label>
              <label className="field">
                <span>
                  {t("행사 소개")} <em className="field-count">{intro.length}/1000</em>
                </span>
                <textarea
                  maxLength={1000}
                  onChange={(changed) => setIntro(changed.target.value)}
                  placeholder={t("어떤 행사인지, 누가 오는지, 브랜드가 무엇을 할 수 있는지 적어 주세요.")}
                  rows={5}
                  value={intro}
                />
              </label>
              <div className="package-editor">
                <span className="field-label">{t("협찬 혜택 묶음")}</span>
                {packages.map((item, index) => (
                  <fieldset className="package-row" key={index}>
                    <legend className="sr-only">{t("혜택 묶음 {count}", { count: index + 1 })}</legend>
                    <input
                      aria-label={t("묶음 이름")}
                      maxLength={30}
                      onChange={(changed) => changePackage(index, "name", changed.target.value)}
                      placeholder={t("예) 메인 스폰서")}
                      value={item.name}
                    />
                    <input
                      aria-label={t("브랜드가 받는 것")}
                      maxLength={200}
                      onChange={(changed) => changePackage(index, "gives", changed.target.value)}
                      placeholder={t("예) 무대 현수막 로고, SNS 게시물 2회")}
                      value={item.gives}
                    />
                    <input
                      aria-label={t("원하는 협찬")}
                      maxLength={100}
                      onChange={(changed) => changePackage(index, "asks", changed.target.value)}
                      placeholder={t("예) 현금 30만원")}
                      value={item.asks}
                    />
                    <button
                      aria-label={t("혜택 묶음 {count} 빼기", { count: index + 1 })}
                      className="delete-button"
                      onClick={() => setPackages((current) => current.filter((_, at) => at !== index))}
                      type="button"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </fieldset>
                ))}
                {packages.length < 4 && (
                  <button
                    className="cancel-button"
                    onClick={() => setPackages((current) => [...current, { name: "", gives: "", asks: "" }])}
                    type="button"
                  >
                    <Icon name="plus" size={15} /> {t("묶음 추가")}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="form-card date-card">
          <h3 className="form-card-title">{tc("heading", "일정")}</h3>
          <p className="form-card-caption">
            {datesLocked
              ? students
                ? t("이미 시작한 행사라 일정은 바꿀 수 없어요.")
                : t("이미 시작한 캠페인이라 일정은 바꿀 수 없어요.")
              : t("첫날과 마지막 날을 차례로 누르면 기간으로 잡혀요. 하루 일정은 한 번만 누르세요.")}
          </p>
          {!datesLocked && (
            <DatePicker
              end={endDate}
              onChange={(start, end) => {
                setDate(start)
                setEndDate(end)
              }}
              start={date}
            />
          )}
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
          {editing ? t("저장하기") : students ? t("등록하고 매칭 받기") : t("등록하고 단체 추천 받기")}
        </button>
      </div>
    </section>
  )
}
