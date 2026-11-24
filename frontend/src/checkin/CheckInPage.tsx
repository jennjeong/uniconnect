import { useEffect, useRef, useState } from "react"

import { ApiError, api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { surveyOptions, surveyQuestions, type SurveyKey } from "../data/survey"
import { t } from "../i18n"
import { saveCouponImage } from "../lib/couponImage"
import { couponState, couponUntil, couponUntilText, keepWithoutPass, mergeTaken, readCheckIn, writeCheckIn, type CheckIn, type TakenCoupon } from "../lib/couponWallet"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

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
  // 스캔한다. 받은 쿠폰이 있으면 다시 스캔된 뒤에만 새로 시작한다: 끝난 행사는
  // 스캔을 받지 않으므로, 패스만 버리고 쿠폰은 기록으로 남긴다(쿠폰함).
  const reopening = useRef(false)
  const restart = () => {
    if (Object.keys(checkIn?.coupons ?? {}).length === 0) {
      scanned.current = false
      save(null)
      return
    }
    if (reopening.current) return
    reopening.current = true
    api
      .recordCheckIn(code, "scans")
      .then(({ entry, pass }) => {
        reopening.current = false
        save({ participant: entry.participant, pass })
      })
      .catch((caught) => {
        // 잠깐의 실패(요청 제한, 서버 오류)에는 그대로 두고, 페이지를 다시 열 때 한 번 더 해 본다.
        const closed = caught instanceof ApiError && caught.status >= 400 && caught.status < 500 && caught.status !== 429
        if (closed) {
          reopening.current = false
          setCheckIn((current) => keepWithoutPass(code, current))
        }
        setError(errorMessage(caught))
      })
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
          setCheckIn((current) => {
            if (current?.pass !== pass) return current
            const next = { ...current, coupons: mergeTaken(current.coupons, coupons) }
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
      const shown = info?.coupons.find((item) => item.id === couponId)
      if (coupon)
        save({
          ...checkIn,
          coupons: {
            ...checkIn.coupons,
            [couponId]: { number: coupon, store: shown?.store, title: shown?.title, takenAt: new Date().toISOString() },
          },
        })
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403) restart()
      else setError(errorMessage(caught))
    } finally {
      setBusy("")
    }
  }

  // 쿠폰함(/coupons)이 서버에 묻지 않고 그릴 수 있게 행사 이름과 쿠폰 내용을 적어 둔다.
  useEffect(() => {
    if (!info || !checkIn) return
    const coupons = Object.fromEntries(
      Object.entries(checkIn.coupons ?? {}).map(([id, coupon]) => {
        const shown = info.coupons.find((item) => item.id === id)
        return [id, { ...coupon, store: coupon.store ?? shown?.store, title: coupon.title ?? shown?.title }]
      }),
    )
    const changed =
      checkIn.eventName !== info.eventName ||
      checkIn.groupName !== info.groupName ||
      Object.entries(coupons).some(([id, coupon]) => coupon.store !== checkIn.coupons?.[id]?.store || coupon.title !== checkIn.coupons?.[id]?.title)
    if (changed) save({ ...checkIn, eventName: info.eventName, groupName: info.groupName, coupons })
  }, [info, checkIn])

  const keepImage = async (couponId: string) => {
    const shown = info?.coupons.find((item) => item.id === couponId)
    const mine = checkIn?.coupons?.[couponId]
    if (!shown || !mine) return
    const saved = await saveCouponImage({
      store: shown.store,
      title: shown.title,
      number: mine.number,
      eventName: info?.eventName,
      until: couponUntil(mine),
    })
    if (!saved) setError(t("이미지를 만들지 못했어요. 화면을 캡처해 주세요."))
  }

  const taken = checkIn?.coupons ?? {}
  // 가게에서 보여 줄 수 있는 쿠폰: 패스가 있고 아직 쓸 수 있는 것.
  const usable = (coupon: TakenCoupon) => Boolean(checkIn?.pass) && couponState(coupon) === "ready"
  const anyWaiting = Object.values(taken).some(usable)

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
            {info.alwaysOn ? t("쿠폰은 받은 날부터 {days}일 동안 쓸 수 있어요.", { days: info.couponDays ?? 0 }) : formatFullDate(info.eventDate)}
          </p>
        )}
        {info?.alwaysOn && info.open === false && <p className="checkin-closed">{t("지금은 새 쿠폰을 받을 수 없어요.")}</p>}

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
                      {info?.alwaysOn ? t("매장 쿠폰") : t("행사 참여자 전용 쿠폰")} · {t(couponTerms)}
                    </small>
                    {mine ? (
                      <div className="coupon-code">
                        <span>{t("쿠폰 번호")}</span>
                        <strong>{mine.number}</strong>
                        {couponUntil(mine) && (
                          <small>{couponUntilText(couponUntil(mine)!, usable(mine) || Boolean(mine.visited))}</small>
                        )}
                        <button
                          aria-label={t("{store} 쿠폰을 이미지로 저장", { store: coupon.store })}
                          className="coupon-save"
                          onClick={() => void keepImage(coupon.id)}
                          type="button"
                        >
                          <Icon name="download" size={16} /> {t("이미지로 저장")}
                        </button>
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

            {Object.keys(taken).length > 0 && (
              <a className="checkin-wallet-link" href="/coupons">
                {t("받은 쿠폰 모아 보기")}
              </a>
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
