import { useEffect, useRef, useState } from "react"

import { api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { formatFullDate } from "../lib/date"
import type { Report } from "../types"

// What this phone has done at the event, kept so a refresh doesn't count twice.
type CheckIn = { participant: string; coupon?: string; visited?: boolean }

// The sponsor's offer for participants of the measured event.
const offer = {
  store: "오후의 커피 공릉점",
  title: "아메리카노 1+1",
  terms: "발급일부터 7일 동안 쓸 수 있어요",
}

const storageKey = (code: string) => `uniconnect-checkin-${code}`

function readCheckIn(code: string): CheckIn | null {
  try {
    return JSON.parse(localStorage.getItem(storageKey(code)) ?? "null")
  } catch {
    return null
  }
}

function writeCheckIn(code: string, checkIn: CheckIn) {
  try {
    localStorage.setItem(storageKey(code), JSON.stringify(checkIn))
  } catch {
    // Without storage a refresh may count again; the visit still works.
  }
}

// "참여자 #96" → "UC-1012-0096"
const couponCode = (code: string, participant: string) =>
  `UC-${code.slice(4)}-${(participant.match(/\d+/)?.[0] ?? "0").padStart(4, "0")}`

// Page participants reach by scanning the event QR: records the scan, hands
// out the sponsor's coupon, and lets store staff confirm the visit.
export function CheckInPage({ code }: { code: string }) {
  const [report, setReport] = useState<Report | null>(null)
  const [checkIn, setCheckIn] = useState<CheckIn | null>(() => readCheckIn(code))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // StrictMode runs effects twice while developing; record the scan once.
  const scanned = useRef(false)

  const save = (next: CheckIn) => {
    setCheckIn(next)
    writeCheckIn(code, next)
  }

  useEffect(() => {
    api
      .report()
      .then((result) => setReport(result.report))
      .catch(() => {
        // The event name is a nicety; check-in works without it.
      })
  }, [])

  // The first visit from this phone counts as one QR scan.
  useEffect(() => {
    if (checkIn || scanned.current) return
    scanned.current = true
    api
      .recordMetric("scans")
      .then(({ entry }) => save({ participant: entry.participant }))
      .catch((caught) => setError(errorMessage(caught)))
  }, [checkIn])

  const record = async (kind: "coupons" | "visits") => {
    if (!checkIn) return
    setBusy(true)
    setError("")
    try {
      const { entry } = await api.recordMetric(kind)
      save(
        kind === "coupons"
          ? { ...checkIn, coupon: couponCode(code, entry.participant) }
          : { ...checkIn, visited: true },
      )
    } catch (caught) {
      setError(errorMessage(caught))
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
        <h1>{report?.eventName ?? "행사 참여"}</h1>
        {report && <p className="checkin-date">{formatFullDate(report.eventDate)}</p>}

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
              <span className="coupon-store">{offer.store}</span>
              <strong className="coupon-title">{offer.title}</strong>
              <small>행사 참여자 전용 쿠폰 · {offer.terms}</small>
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
                <div className="checkin-staff">
                  <p>매장에서 이 화면을 직원에게 보여 주세요.</p>
                  <button
                    className="cancel-button wide"
                    disabled={busy}
                    onClick={() => record("visits")}
                    type="button"
                  >
                    직원 확인 완료
                  </button>
                </div>
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
