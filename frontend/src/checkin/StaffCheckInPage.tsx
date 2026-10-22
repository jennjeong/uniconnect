import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

// The PIN stays in this tab for the next coupons, never in a participant's
// browser.
const pinKey = (code: string) => `uniconnect-staff-pin-${code}`

function readPin(code: string) {
  try {
    return sessionStorage.getItem(pinKey(code)) ?? ""
  } catch {
    return ""
  }
}

function writePin(code: string, pin: string) {
  try {
    sessionStorage.setItem(pinKey(code), pin)
  } catch {
    // Without storage the PIN is typed again for each coupon.
  }
}

// The sponsor's store staff open /check-in/<code>/staff on their own device:
// with their store's staff PIN, each participant's coupon number for that
// store confirms one store visit.
export function StaffCheckInPage({ code }: { code: string }) {
  const [info, setInfo] = useState<CheckInInfo | null>(null)
  const [pin, setPin] = useState(() => readPin(code))
  const [coupon, setCoupon] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmed, setConfirmed] = useState<string[]>([])

  useEffect(() => {
    api
      .checkIn(code)
      .then(setInfo)
      .catch((caught) => setError(errorMessage(caught)))
  }, [code])

  const confirm = async () => {
    const number = coupon.trim().toUpperCase()
    if (pin.length !== 4) return setError("직원 PIN 4자리를 입력해 주세요.")
    if (!number) return setError("참여자의 쿠폰 번호를 입력해 주세요.")
    setBusy(true)
    setError("")
    try {
      const { entry, store } = await api.confirmVisit(code, { pin, coupon: number })
      writePin(code, pin)
      setConfirmed((current) => [`${number} · ${store} · ${entry.participant}`, ...current].slice(0, 5))
      setCoupon("")
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
        <span className="checkin-kicker">매장 직원용</span>
        <h1>{info?.eventName ?? "방문 확인"}</h1>
        {info && (
          <p className="checkin-date">
            {info.groupName && `${info.groupName} · `}
            {formatFullDate(info.eventDate)}
          </p>
        )}
        <p className="checkin-staff">
          참여자가 보여 주는 우리 매장 쿠폰 번호를 입력하면 매장 방문이 기록돼요. 직원 PIN은 행사 주최 측에서 매장마다 받아 주세요.
        </p>

        <form
          className="staff-form"
          onSubmit={(event) => {
            event.preventDefault()
            void confirm()
          }}
        >
          <label>
            직원 PIN
            <input
              autoComplete="off"
              className="checkin-pin"
              inputMode="numeric"
              maxLength={4}
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            />
          </label>
          <label>
            쿠폰 번호
            <input
              autoCapitalize="characters"
              autoComplete="off"
              className="checkin-pin"
              placeholder="UC-XXXXXX"
              value={coupon}
              onChange={(event) => setCoupon(event.target.value.toUpperCase())}
            />
          </label>
          <button className="primary-button wide" disabled={busy} type="submit">
            방문 확인
          </button>
        </form>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {confirmed.length > 0 && (
          <ul aria-label="방금 확인한 방문" className="staff-confirmed" role="status">
            {confirmed.map((line) => (
              <li key={line}>{line} 방문 확인</li>
            ))}
          </ul>
        )}
      </main>

      <footer className="checkin-footer">uniconnect · 학생단체와 브랜드를 잇는 협찬 플랫폼</footer>
    </div>
  )
}
