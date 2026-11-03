import { useState } from "react"

import type { EventDraft } from "../api"
import { DatePicker } from "../components/DatePicker"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { audienceYears, eventKinds, handoutWays, logoSpots, promoPosts } from "../data/eventDetails"
import { sponsorOptions } from "../data/sponsorTypes"
import { t, tc } from "../i18n"
import { formatPeriod, todayIso } from "../lib/date"
import type { EventItem, Role, SponsorPackage } from "../types"

// Full page for registering an event or campaign, or editing one.
export function EventCreatePage({
  role,
  event,
  copyFrom,
  initialDate,
  onCancel,
  onSubmit,
}: {
  role: Role
  // The event or campaign being edited; a new one when absent.
  event?: EventItem
  // An earlier one a new one starts from (행사 복제): everything but its days.
  copyFrom?: EventItem
  // "YYYY-MM-DD", usually the day picked on the calendar.
  initialDate: string
  onCancel: () => void
  onSubmit: (draft: EventDraft) => Promise<void>
}) {
  const students = role === "학생단체"
  const editing = event !== undefined
  // Its dates stay once it has begun, as its results were counted on them.
  const datesLocked = editing && event.date <= todayIso()
  const source = event ?? copyFrom
  const [name, setName] = useState(source?.name ?? "")
  // Digits only, from "1,234명".
  const [people, setPeople] = useState(source?.people.replace(/\D/g, "") ?? "")
  // Digits only; the event's or campaign's budget in won.
  const [budget, setBudget] = useState(source?.budget === undefined ? "" : String(source.budget))
  // The first day, and the last when it runs over several days.
  const [date, setDate] = useState(event?.date ?? initialDate)
  const [endDate, setEndDate] = useState<string | undefined>(event?.endDate)
  const [types, setTypes] = useState<string[]>(source?.types ?? [])
  const [typeNote, setTypeNote] = useState(source?.typeNote ?? "")
  // A group's event page: where, what it is, and the packages it offers.
  const [venue, setVenue] = useState(source?.venue ?? "")
  const [intro, setIntro] = useState(source?.intro ?? "")
  const [packages, setPackages] = useState<SponsorPackage[]>(source?.packages ?? [])
  // What kind of event, when each day runs, and who comes.
  const [kind, setKind] = useState(source?.kind ?? "")
  const [startTime, setStartTime] = useState(source?.startTime ?? "")
  const [endTime, setEndTime] = useState(source?.endTime ?? "")
  const [years, setYears] = useState<string[]>(source?.makeup?.years ?? [])
  const [majors, setMajors] = useState(source?.makeup?.majors ?? "")
  // 홍보 · 배포 계획: what the group offers brands, and its agreement to
  // carry it out (kept when editing; a copy asks again).
  const [spots, setSpots] = useState<string[]>(source?.promo?.spots ?? [])
  const [handouts, setHandouts] = useState<string[]>(source?.promo?.handouts ?? [])
  const [posts, setPosts] = useState<string[]>(source?.promo?.posts ?? [])
  const [promoAgreed, setPromoAgreed] = useState(Boolean(event?.promo))
  const promoChosen = spots.length + handouts.length + posts.length > 0
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
            : startTime && endTime && endTime <= startTime
              ? t("끝나는 시각은 시작 시각 뒤로 골라 주세요.")
              : students && promoChosen && !promoAgreed
                ? t("고른 홍보 · 배포 계획을 이행하는 데 동의해 주세요.")
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
        budget: budget ? Number(budget) : undefined,
        ...(students
          ? {
              venue: venue.trim(),
              intro: intro.trim(),
              packages: filled,
              kind: kind || undefined,
              startTime: startTime || undefined,
              endTime: (startTime && endTime) || undefined,
              makeup: { years, majors: majors.trim() },
              promo: { spots, handouts, posts, ...(event?.promo ? { agreedAt: event.promo.agreedAt } : {}) },
              promoAgreed,
            }
          : {}),
      })
    } finally {
      setBusy(false)
    }
  }

  // One list of short choices as the form's check rows.
  const choices = (label: string, list: readonly string[], chosen: string[], set: (next: string[]) => void) => (
    <>
      <span className="field-label">{label}</span>
      <div className="check-list compact">
        {list.map((option) => {
          const checked = chosen.includes(option)
          return (
            <label className={checked ? "check-row checked" : "check-row"} key={option}>
              <input
                checked={checked}
                onChange={() => set(checked ? chosen.filter((item) => item !== option) : [...chosen, option])}
                type="checkbox"
              />
              <span aria-hidden="true" className="check-box">
                <Icon name="check" size={14} />
              </span>
              <span className="check-copy">
                <strong>{t(option)}</strong>
              </span>
            </label>
          )
        })}
      </div>
    </>
  )

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
            ? t("고친 내용은 제안과 협찬에도 반영되고 상대에게 메일로 알려요.")
            : copyFrom
              ? t("‘{name}’을 그대로 가져왔어요. 날짜만 고르면 돼요.", { name: copyFrom.name })
              : students
              ? t("행사를 알려 주시면, 딱 맞는 브랜드를 찾아 드려요.")
              : t("캠페인을 알려 주시면, 딱 맞는 학생단체를 찾아 드려요.")
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
            <label className="field">
              <span>{t("예산")}</span>
              <div className="input-suffix">
                <input
                  inputMode="numeric"
                  onChange={(event) =>
                    setBudget(event.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 10))
                  }
                  placeholder={students ? t("예) 300,000") : t("예) 800,000")}
                  value={budget ? Number(budget).toLocaleString("ko-KR") : ""}
                />
                <em>{t("원")}</em>
              </div>
            </label>
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
                <span>{t("행사 유형")}</span>
                <select onChange={(changed) => setKind(changed.target.value)} value={kind}>
                  <option value="">{t("고르지 않음")}</option>
                  {eventKinds.map((item) => (
                    <option key={item} value={item}>
                      {t(item)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-pair">
                <label className="field">
                  <span>{t("시작 시각")}</span>
                  <TimeSelect
                    onChange={(time) => {
                      setStartTime(time)
                      if (!time || (endTime && endTime <= time)) setEndTime("")
                    }}
                    value={startTime}
                  />
                </label>
                <label className="field">
                  <span>{t("끝나는 시각")}</span>
                  <TimeSelect after={startTime} disabled={!startTime} onChange={setEndTime} value={endTime} />
                </label>
              </div>
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
          {students && (
            <div aria-labelledby="promo-title" className="form-card" role="group">
              <h3 className="form-card-title" id="promo-title">
                {t("홍보 · 배포 계획")}
              </h3>
              <p className="form-card-caption">{t("브랜드가 무엇을 받는지 고르면, 협찬이 확정될 때 계약서의 할 일로 그대로 들어가요.")}</p>
              {choices(t("로고가 보이는 곳"), logoSpots, spots, setSpots)}
              {choices(t("현장 배포 방식"), handoutWays, handouts, setHandouts)}
              {choices(t("SNS 홍보"), promoPosts, posts, setPosts)}
              {promoChosen && (
                <label className={promoAgreed ? "check-row checked promo-agree" : "check-row promo-agree"}>
                  <input checked={promoAgreed} onChange={() => setPromoAgreed(!promoAgreed)} type="checkbox" />
                  <span aria-hidden="true" className="check-box">
                    <Icon name="check" size={14} />
                  </span>
                  <span className="check-copy">
                    <strong>{t("고른 홍보를 이행할게요")}</strong>
                    <small>{t("협찬을 받으면 고른 방식대로 홍보하고 계약서에서 증빙을 남겨요.")}</small>
                  </span>
                </label>
              )}
            </div>
          )}
          {students && (
            <div aria-labelledby="makeup-title" className="form-card" role="group">
              <h3 className="form-card-title" id="makeup-title">
                {t("참가자 구성")}
              </h3>
              <p className="form-card-caption">{t("정확하지 않아도 괜찮아요. 브랜드가 맞는 제품을 고르는 데 써요.")}</p>
              <span className="field-label">{t("오는 사람")}</span>
              <div className="check-list compact stagger">
                {audienceYears.map((year) => {
                  const checked = years.includes(year)
                  return (
                    <label className={checked ? "check-row checked" : "check-row"} key={year}>
                      <input
                        checked={checked}
                        onChange={() => setYears((current) => (checked ? current.filter((item) => item !== year) : [...current, year]))}
                        type="checkbox"
                      />
                      <span aria-hidden="true" className="check-box">
                        <Icon name="check" size={14} />
                      </span>
                      <span className="check-copy">
                        <strong>{t(year)}</strong>
                      </span>
                    </label>
                  )
                })}
              </div>
              <label className="field">
                <span>{t("주요 전공")}</span>
                <input maxLength={60} onChange={(changed) => setMajors(changed.target.value)} placeholder={t("예) 인공지능융합학부, 컴퓨터공학")} value={majors} />
              </label>
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

// Every half hour from 6:00 to 23:30, written as the event page shows times
// (24-hour, as 18:30), with a time saved off that grid kept as it was. The
// end time offers only times after the start.
const halfHours = Array.from({ length: 36 }, (_, index) => {
  const minutes = 6 * 60 + index * 30
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
})

function TimeSelect({
  value,
  onChange,
  after,
  disabled,
}: {
  value: string
  onChange: (time: string) => void
  after?: string
  disabled?: boolean
}) {
  const times = [...new Set([...halfHours, ...(value ? [value] : [])])]
    .sort()
    .filter((time) => !after || time > after)
  return (
    <select disabled={disabled} onChange={(changed) => onChange(changed.target.value)} value={value}>
      <option value="">{t("고르지 않음")}</option>
      {times.map((time) => (
        <option key={time} value={time}>
          {time}
        </option>
      ))}
    </select>
  )
}
