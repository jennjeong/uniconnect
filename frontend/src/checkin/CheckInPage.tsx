import { useEffect, useRef, useState } from "react"

import { ApiError, api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { surveyOptions, surveyQuestions, type SurveyKey } from "../data/survey"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

// 이 휴대폰이 행사에서 한 일. 새로고침해도 두 번 세지 않도록 저장해 둔다.
// `pass`는 서버가 쿠폰을 한 번씩만 세게 하고, `coupons`는 가게 직원이 자기
// 기기에서 방문을 확인할 때 쓰는 번호를 쿠폰 id별로(스폰서마다 하나) 담는다.
type TakenCoupon = { number: string; visited?: boolean }
// 선택 설문을 이 휴대폰에서 보냈거나 건너뛰면 `surveyed`.
type CheckIn = { participant: string; pass?: string; coupons?: Record<string, TakenCoupon>; surveyed?: true }

// 선택 질문 세 개. 각각 선택지가 한 줄이고, 한 번 보내거나 건너뛴다.
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

// 가게가 방문을 확인했는지 휴대폰이 묻는 주기.
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
    // 저장소가 없으면 새로고침 때 다시 셀 수 있다. 방문 자체는 동작한다.
  }
}

// 참가자가 행사 QR을 스캔해 들어오는 페이지. 그 행사의 스캔을 기록하고 스폰서별
// 쿠폰을 번호와 함께 준다. 가게 직원은 자기 기기(StaffCheckInPage)에서 그
// 번호로 방문을 확인하고, 이 페이지는 그것을 확인됨으로 보여 준다.
export function CheckInPage({ code }: { code: string }) {
  const [info, setInfo] = useState<CheckInInfo | null>(null)
  const [checkIn, setCheckIn] = useState<CheckIn | null>(() => readCheckIn(code))
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  // StrictMode는 개발 중 effect를 두 번 실행한다. 스캔은 한 번만 기록한다.
  const scanned = useRef(false)

  const save = (next: CheckIn | null) => {
    setCheckIn(next)
    writeCheckIn(code, next)
  }

  // 패스가 생기기 전에 저장된 체크인이나 서버가 더는 모르는 체크인은 다시
  // 스캔한다.
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

  // 이 휴대폰의 첫 방문은 QR 스캔 한 번으로 센다.
  useEffect(() => {
    if (checkIn || scanned.current) return
    scanned.current = true
    api
      .recordCheckIn(code, "scans")
      .then(({ entry, pass }) => save({ participant: entry.participant, pass }))
      .catch((caught) => setError(errorMessage(caught)))
  }, [checkIn, code])

  // 이 패스의 쿠폰에 대한 서버의 답. 도착할 때 한 번, 받은 쿠폰이 가게를
  // 기다리는 동안은 몇 초마다 확인한다.
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
