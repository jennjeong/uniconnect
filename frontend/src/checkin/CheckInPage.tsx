import { useEffect, useRef, useState } from "react"

import { ApiError, api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

// What this phone has done at the event, kept so a refresh doesn't count
// twice; `pass` lets the server count its coupon and visit once each.
type CheckIn = { participant: string; pass?: string; coupon?: string; visited?: boolean }

const couponTerms = "발급일부터 7일 동안 쓸 수 있어요"

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

// "참여자 #96" → "UC-1012-0096"
const couponCode = (code: string, participant: string) =>
  `UC-${code.slice(4)}-${(participant.match(/\d+/)?.[0] ?? "0").padStart(4, "0")}`

// Page participants reach by scanning the event QR: records the scan for
// that event, hands out the sponsor's coupon, and lets store staff confirm
// the visit.
export function CheckInPage({ code }: { code: string }) {
  const [info, setInfo] = useState<CheckInInfo | null>(null)
  const [checkIn, setCheckIn] = useState<CheckIn | null>(() => readCheckIn(code))
  const [busy, setBusy] = useState(false)
  // The staff PIN, typed by the store's staff when the coupon is used.
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  // StrictMode runs effects twice while developing; record the scan once.
  const scanned = useRef(false)

  const save = (next: CheckIn) => {
    setCheckIn(next)
    writeCheckIn(code, next)
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

  // A check-in kept from before passes existed scans again for one.
  const restart = () => {
    writeCheckIn(code, null)
    scanned.current = false
    setCheckIn(null)
  }

  const record = async (kind: "coupons" | "visits") => {
    if (!checkIn) return
    if (!checkIn.pass) {
      restart()
      return
    }
    setBusy(true)
    setError("")
    try {
      const { entry } = await api.recordCheckIn(code, kind, {
        pass: checkIn.pass,
        ...(kind === "visits" ? { pin } : {}),
      })
      save(
        kind === "coupons"
          ? { ...checkIn, coupon: couponCode(code, entry.participant) }
          : { ...checkIn, visited: true },
      )
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403 && kind === "coupons") restart()
      else setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="checkin">
      <header className="checkin-header">
        <img alt="uniconnect" src={logo} />
      </header>

      <main className="checkin-card">
        <span className="checkin-kicker">현장 참여</span>
        <h1>{info?.eventName ?? "행사 참여"}</h1>
        {info && (
          <p className="checkin-date">
            {info.groupName && `${info.groupName} · `}
            {formatFullDate(info.eventDate)}
          </p>
        )}

        {!checkIn ? (
          !error && <p className="checkin-loading">참여를 기록하고 있어요…</p>
        ) : (
          <>
            <div className="checkin-welcome">
              <span className="checkin-check">
                <Icon name="check" size={18} />
              </span>
              <div>
                <strong>참여해 주셔서 감사해요!</strong>
                <span>{checkIn.participant}로 기록됐어요.</span>
              </div>
            </div>

            <div className="coupon">
              <span className="coupon-store">{info?.coupon.store ?? "협찬 매장"}</span>
              <strong className="coupon-title">{info?.coupon.title ?? "참여자 전용 혜택"}</strong>
              <small>행사 참여자 전용 쿠폰 · {couponTerms}</small>
              {checkIn.coupon ? (
                <div className="coupon-code">
                  <span>쿠폰 번호</span>
                  <strong>{checkIn.coupon}</strong>
                </div>
              ) : (
                <button
                  className="primary-button wide"
                  disabled={busy}
                  onClick={() => record("coupons")}
                  type="button"
                >
                  쿠폰 받기
                </button>
              )}
            </div>

            {checkIn.coupon &&
              (checkIn.visited ? (
                <p className="checkin-done">
                  <Icon name="check" size={16} /> 방문이 확인됐어요. 맛있게 드세요!
                </p>
              ) : (
                <form
                  className="checkin-staff"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void record("visits")
                  }}
                >
                  <p>매장에서 이 화면을 직원에게 보여 주세요. 직원이 PIN을 넣으면 방문이 확인돼요.</p>
                  <input
                    aria-label="직원 확인 PIN"
                    autoComplete="off"
                    className="checkin-pin"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="직원 PIN 4자리"
                    type="password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <button className="cancel-button wide" disabled={busy || pin.length !== 4} type="submit">
                    직원 확인 완료
                  </button>
                </form>
              ))}
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </main>

      <footer className="checkin-footer">uniconnect · 학생단체와 브랜드를 잇는 협찬 플랫폼</footer>
    </div>
  )
}
