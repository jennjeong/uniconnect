import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { PasswordField } from "../components/PasswordField"
import { VenueCounters } from "../components/VenueCounters"
import { isVenueMethod } from "../data/methods"
import { useVenueSession } from "../hooks/useVenueSession"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

// 스폰서의 가게 직원은 자기 기기에서 /check-in/<code>/staff를 연다. 가게의 직원
// PIN(다음 쿠폰을 위해 이 탭에만 두고 참가자의 브라우저에는 두지 않는다)으로
// 참가자의 쿠폰 번호마다 매장 방문을 한 번 확인하고, 협찬의 측정 방식이
// 브랜드에 맡긴 현장 확인(예: 나눠 준 샘플)은 아래에서 센다.
export function StaffCheckInPage({ code }: { code: string }) {
  const [info, setInfo] = useState<CheckInInfo | null>(null)
  const venue = useVenueSession(code, "staff")
  const [coupon, setCoupon] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmed, setConfirmed] = useState<string[]>([])
  const share = venue.session?.shares[0]
  // 협찬이 매장 방문을 확인하는 동안(그리고 PIN이 어느 몫을 여는지 알려 주기
  // 전까지) 방문을 확인한다.
  const visits = !share || share.kinds.includes("visit")

  useEffect(() => {
    api
      .checkIn(code)
      .then(setInfo)
      .catch((caught) => setError(errorMessage(caught)))
  }, [code])

  const confirm = async () => {
    const number = coupon.trim().toUpperCase()
    if (venue.pin.length !== 4) return setError(t("직원 PIN 4자리를 입력해 주세요."))
    if (!number) return setError(t("참여자의 쿠폰 번호를 입력해 주세요."))
    setBusy(true)
    setError("")
    try {
      const { entry, store } = await api.confirmVisit(code, { pin: venue.pin, coupon: number })
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
        <span className="checkin-kicker">{t("매장 직원용")}</span>
        <h1>{info?.eventName ?? t("방문 확인")}</h1>
        {info && (
          <p className="checkin-date">
            {info.groupName && `${info.groupName} · `}
            {formatFullDate(info.eventDate)}
          </p>
        )}
        <p className="checkin-staff">
          {visits
            ? t("참여자가 보여 주는 우리 매장 쿠폰 번호를 입력하면 매장 방문이 기록돼요. 직원 PIN은 행사 주최 측에서 매장마다 받아 주세요.")
            : t("임시 전자 계약서에서 우리 브랜드가 확인하기로 한 협찬 확인 방식을 여기서 기록해요. 직원 PIN은 임시 전자 계약서에서 볼 수 있어요.")}
        </p>

        <form
          className="staff-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (visits) void confirm()
          }}
        >
          <PasswordField
            autoComplete="off"
            className="checkin-pin"
            inputMode="numeric"
            label={t("직원 PIN")}
            maxLength={4}
            toggleLabel={t("PIN 보기")}
            value={venue.pin}
            onChange={(event) => venue.setPin(event.target.value)}
          />
          {visits && (
            <>
              <label>
                {t("쿠폰 번호")}
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
                {t("방문 확인")}
              </button>
            </>
          )}
        </form>

        {(error || venue.error) && (
          <p className="form-error" role="alert">
            {error || venue.error}
          </p>
        )}
        {confirmed.length > 0 && (
          <ul aria-label={t("방금 확인한 방문")} className="staff-confirmed" role="status">
            {confirmed.map((line) => (
              <li key={line}>{t("{line} 방문 확인", { line })}</li>
            ))}
          </ul>
        )}

        {share?.kinds.some(isVenueMethod) && (
          <section aria-label={t("현장 집계")} className="venue-share">
            <VenueCounters busy={venue.busy} onCount={(method, amount) => venue.count(share.id, method, amount)} share={share} />
          </section>
        )}
      </main>

      <footer className="checkin-footer">uniconnect · {t("학생단체와 브랜드를 잇는 협찬 플랫폼")}</footer>
    </div>
  )
}
