import { useEffect, useRef, useState } from "react"

import { ApiError, api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { surveyOptions, surveyQuestions, type SurveyKey } from "../data/survey"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

// What this phone has done at the event, kept so a refresh doesn't count
// twice: `pass` lets the server count each coupon once, and `coupons` holds
// the numbers the store staff confirm visits with on their own device, by
// coupon id (one per sponsor).
type TakenCoupon = { number: string; visited?: boolean }
// `surveyed` once the optional survey was sent or skipped on this phone.
type CheckIn = { participant: string; pass?: string; coupons?: Record<string, TakenCoupon>; surveyed?: true }

// The optional three questions, each a row of choices; sent once, or skipped.
function Survey({ onSend, onSkip }: { onSend: (answers: Partial<Record<SurveyKey, string>>) => Promise<void>; onSkip: () => void }) {
  const [answers, setAnswers] = useState<Partial<Record<SurveyKey, string>>>({})
  const [sending, setSending] = useState(false)
  const keys = Object.keys(surveyOptions) as SurveyKey[]
  return (
    <section aria-labelledby="survey-title" className="checkin-survey">
      <h2 id="survey-title">{t("10초 설문 (선택)")}</h2>
      <p>{t("이름이나 연락처는 묻지 않아요. 답은 행사별 숫자로만 모아 행사를 더 좋게 만드는 데 써요.")}</p>
      {keys.map((key) => (
        <fieldset key={key}>
          <legend>{t(surveyQuestions[key])}</legend>
          <div>
            {surveyOptions[key].map((option) => (
              <button
                aria-pressed={answers[key] === option}
                className={answers[key] === option ? "on" : undefined}
                key={option}
                onClick={() => setAnswers({ ...answers, [key]: answers[key] === option ? undefined : option })}
                type="button"
              >
                {t(option)}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="checkin-survey-actions">
        <button className="cancel-button" onClick={onSkip} type="button">
          {t("건너뛰기")}
        </button>
        <button
          className="primary-button"
          disabled={sending || Object.values(answers).every((value) => !value)}
          onClick={() => {
            setSending(true)
            void onSend(answers).finally(() => setSending(false))
          }}
          type="button"
        >
          {t("보내기")}
        </button>
      </div>
    </section>
  )
}

const couponTerms = "발급일부터 7일 동안 쓸 수 있어요"

// How often the phone asks whether the store has confirmed a visit.
const visitCheckMs = 3_000

const storageKey = (code: string) => `uniconnect-checkin-${code}`

function readCheckIn(code: string): CheckIn | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey(code)) ?? "null")
  } catch {
    return null
  }
}

function writeCheckIn(code: string, checkIn: CheckIn | null) {
  try {
    if (checkIn) localStorage.setItem(storageKey(code), JSON.stringify(checkIn))
    else localStorage.removeItem(storageKey(code))
  } catch {
    // Without storage a refresh may count again; the visit still works.
  }
}

// Page participants reach by scanning the event QR: records the scan for
// that event and hands out each sponsor's coupon with its number. Store
// staff confirm the visit on their own device (StaffCheckInPage) with that
// number; this page then shows it as confirmed.
export function CheckInPage({ code }: { code: string }) {
  const [info, setInfo] = useState<CheckInInfo | null>(null)
  const [checkIn, setCheckIn] = useState<CheckIn | null>(() => readCheckIn(code))
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  // StrictMode runs effects twice while developing; record the scan once.
  const scanned = useRef(false)

  const save = (next: CheckIn | null) => {
    setCheckIn(next)
    writeCheckIn(code, next)
  }

  // A check-in kept from before passes existed, or one the server no longer
  // knows, scans again.
  const restart = () => {
    scanned.current = false
    save(null)
  }

  useEffect(() => {
    api
      .checkIn(code)
      .then(setInfo)
      .catch((caught) => setError(errorMessage(caught)))
  }, [code])

  // The first visit from this phone counts as one QR scan.
  useEffect(() => {
    if (checkIn || scanned.current) return
    scanned.current = true
    api
      .recordCheckIn(code, "scans")
      .then(({ entry, pass }) => save({ participant: entry.participant, pass }))
      .catch((caught) => setError(errorMessage(caught)))
  }, [checkIn, code])

  // The server's word on this pass's coupons, once on arrival and, while a
  // taken coupon waits for the store, every few seconds.
  const pass = checkIn?.pass
  const waiting = Object.values(checkIn?.coupons ?? {}).some((coupon) => !coupon.visited)
  useEffect(() => {
    if (!pass) return
    let cancelled = false
    const check = () =>
      api
        .checkInPass(code, pass)
        .then(({ coupons }) => {
          if (cancelled) return
          const taken = Object.fromEntries(
            Object.entries(coupons).flatMap(([id, coupon]) =>
              coupon.number ? [[id, { number: coupon.number, visited: coupon.visited }]] : [],
            ),
          )
          setCheckIn((current) => {
            if (current?.pass !== pass) return current
            const next = { ...current, coupons: taken }
            writeCheckIn(code, next)
            return next
          })
        })
        .catch((caught) => {
          if (!cancelled && caught instanceof ApiError && caught.status === 404) restart()
        })
    check()
    const timer = waiting ? window.setInterval(check, visitCheckMs) : undefined
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [code, pass, waiting])

  const takeCoupon = async (couponId: string) => {
    if (!checkIn) return
    if (!checkIn.pass) {
      restart()
      return
    }
    setBusy(couponId)
    setError("")
    try {
      const { coupon } = await api.recordCheckIn(code, "coupons", { pass: checkIn.pass, couponId })
      if (coupon) save({ ...checkIn, coupons: { ...checkIn.coupons, [couponId]: { number: coupon } } })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) restart()
      else setError(errorMessage(caught))
    } finally {
      setBusy("")
    }
  }

  const taken = checkIn?.coupons ?? {}
  const anyWaiting = Object.values(taken).some((coupon) => !coupon.visited)

  return (
    <div className="checkin">
      <header className="checkin-header">
        <img alt="uniconnect" src={logo} />
      </header>

      <main className="checkin-card">
        <span className="checkin-kicker">{t("현장 참여")}</span>
        <h1>{info?.eventName ?? t("행사 참여")}</h1>
        {info && (
          <p className="checkin-date">
            {info.groupName && `${info.groupName} · `}
            {formatFullDate(info.eventDate)}
          </p>
        )}

        {!checkIn ? (
          !error && <p className="checkin-loading">{t("참여를 기록하고 있어요…")}</p>
        ) : (
          <>
            <div className="checkin-welcome">
              <span className="checkin-check">
                <Icon name="check" size={18} />
              </span>
              <div>
                <strong>{t("참여해 주셔서 감사해요!")}</strong>
                <span>{t("{participant}로 기록됐어요.", { participant: checkIn.participant })}</span>
              </div>
            </div>

            <ul className="coupon-list">
              {(info?.coupons ?? []).map((coupon) => {
                const mine = taken[coupon.id]
                return (
                  <li className="coupon" key={coupon.id}>
                    <span className="coupon-store">{coupon.store}</span>
                    <strong className="coupon-title">{coupon.title}</strong>
                    <small>
                      {t("행사 참여자 전용 쿠폰")} · {t(couponTerms)}
                    </small>
                    {mine ? (
                      <div className="coupon-code">
                        <span>{t("쿠폰 번호")}</span>
                        <strong>{mine.number}</strong>
                      </div>
                    ) : (
                      <button
                        aria-label={t("{store} 쿠폰 받기", { store: coupon.store })}
                        className="primary-button wide"
                        disabled={busy === coupon.id}
                        onClick={() => void takeCoupon(coupon.id)}
                        type="button"
                      >
                        {t("쿠폰 받기")}
                      </button>
                    )}
                    {mine?.visited && (
                      <p className="checkin-done">
                        <Icon name="check" size={16} /> {t("방문이 확인됐어요. 맛있게 드세요!")}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>

            {checkIn.pass && !checkIn.surveyed && (
              <Survey
                onSend={async (answers) => {
                  try {
                    await api.answerSurvey(code, { pass: checkIn.pass!, ...answers })
                  } catch (caught) {
                    if (!(caught instanceof ApiError && caught.status === 409)) {
                      setError(errorMessage(caught))
                      return
                    }
                  }
                  save({ ...checkIn, surveyed: true })
                }}
                onSkip={() => save({ ...checkIn, surveyed: true })}
              />
            )}

            {anyWaiting && (
              <p className="checkin-staff" role="status">
                {t("매장에서 쿠폰 번호를 직원에게 보여 주세요. 직원이 확인하면 여기에 바로 표시돼요.")}
              </p>
            )}
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="checkin-footer">uniconnect · {t("학생단체와 브랜드를 잇는 협찬 플랫폼")}</footer>
    </div>
  )
}
