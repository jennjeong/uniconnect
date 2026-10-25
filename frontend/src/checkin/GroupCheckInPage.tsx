import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { PasswordField } from "../components/PasswordField"
import { VenueCounters } from "../components/VenueCounters"
import { useVenueSession } from "../hooks/useVenueSession"
import { t } from "../i18n"
import { formatFullDate } from "../lib/date"
import type { CheckInInfo } from "../types"

// The student group's staff open /check-in/<code>/group on their own device:
// the event shows at once, as on the staff page, so they know it is the
// right one; with the group's venue PIN (on its agreements) they confirm
// what the sponsorships' measurement methods give the group to confirm, such
// as booth stamps or SNS posts, for each sponsor.
export function GroupCheckInPage({ code }: { code: string }) {
  const [info, setInfo] = useState<CheckInInfo | null>(null)
  const [infoError, setInfoError] = useState("")
  const venue = useVenueSession(code, "group")
  const shares = venue.session?.shares.filter((share) => share.kinds.length > 0) ?? []

  useEffect(() => {
    api
      .checkIn(code)
      .then(setInfo)
      .catch((caught) => setInfoError(errorMessage(caught)))
  }, [code])

  return (
    <div className="checkin">
      <header className="checkin-header">
        <img alt="uniconnect" src={logo} />
      </header>

      <main className="checkin-card">
        <span className="checkin-kicker">{t("학생단체 현장 확인")}</span>
        <h1>{info?.eventName ?? t("현장 확인")}</h1>
        {info && (
          <p className="checkin-date">
            {info.groupName && `${info.groupName} · `}
            {formatFullDate(info.eventDate)}
          </p>
        )}
        <p className="checkin-staff">
          {t("협찬 약속서에서 우리 단체가 확인하기로 한 측정 방식을 여기서 기록해요. 단체 확인 PIN은 협찬 약속서와 성과의 현장 QR에서 볼 수 있어요.")}
        </p>

        <form className="staff-form" onSubmit={(event) => event.preventDefault()}>
          <PasswordField
            autoComplete="off"
            className="checkin-pin"
            inputMode="numeric"
            label={t("단체 확인 PIN")}
            maxLength={4}
            toggleLabel={t("PIN 보기")}
            value={venue.pin}
            onChange={(event) => venue.setPin(event.target.value)}
          />
        </form>

        {venue.session && shares.length === 0 && (
          <p className="checkin-staff">{t("우리 단체가 현장에서 확인할 측정 방식이 아직 없어요. 협찬 약속서에서 정해 주세요.")}</p>
        )}
        {shares.map((share) => (
          <section aria-label={share.brandName ?? t("현장 확인")} className="venue-share" key={share.id}>
            {share.brandName && <h2>{share.brandName}</h2>}
            <VenueCounters busy={venue.busy} onCount={(method, amount) => venue.count(share.id, method, amount)} share={share} />
          </section>
        ))}

        {(infoError || venue.error) && (
          <p className="form-error" role="alert">
            {infoError || venue.error}
          </p>
        )}
      </main>

      <footer className="checkin-footer">uniconnect · {t("학생단체와 브랜드를 잇는 협찬 플랫폼")}</footer>
    </div>
  )
}
