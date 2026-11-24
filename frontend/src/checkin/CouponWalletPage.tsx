import { useEffect, useState } from "react"

import { api } from "../api"
import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { t } from "../i18n"
import { saveCouponImage } from "../lib/couponImage"
import { couponUntilText, hideCoupon, mergeTaken, readCheckIn, savedCheckIns, walletCoupons, writeCheckIn, type CouponState, type WalletCoupon } from "../lib/couponWallet"

const stateLabel: Record<CouponState, string> = {
  ready: "쓸 수 있어요",
  used: "방문 확인됨",
  expired: "기한 지남",
}

// 이 휴대폰의 쿠폰함(/coupons, #352). 행사 QR로 받은 쿠폰을 한곳에 모은다.
// 로그인이 없고 서버에 쿠폰 목록을 두지 않으므로, 이 브라우저에 남은 것만 보인다.
export function CouponWalletPage() {
  const [coupons, setCoupons] = useState<WalletCoupon[]>(() => walletCoupons(savedCheckIns()))
  const [error, setError] = useState("")

  // 가게가 그 사이 방문을 확인했을 수 있다. 쓸 수 있는 쿠폰이 있는 행사만 한 번 묻는다.
  useEffect(() => {
    let cancelled = false
    const open = savedCheckIns().filter(([, checkIn]) =>
      Object.values(checkIn?.coupons ?? {}).some((coupon) => !coupon.visited && !coupon.hidden) && checkIn?.pass,
    )
    void Promise.allSettled(
      open.map(([code, checkIn]) =>
        api.checkInPass(code, checkIn!.pass!).then(({ coupons: server }) => {
          // 답을 기다리는 동안 쿠폰을 숨겼을 수 있으니 지금 저장된 것에 붙인다.
          const current = readCheckIn(code)
          if (current && current.pass === checkIn!.pass) writeCheckIn(code, { ...current, coupons: mergeTaken(current.coupons, server) })
        }),
      ),
    ).then(() => {
      if (!cancelled) setCoupons(walletCoupons(savedCheckIns()))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const keepImage = async (coupon: WalletCoupon) => {
    setError("")
    const saved = await saveCouponImage({
      store: coupon.store ?? t("매장"),
      title: coupon.title ?? t("행사 참여자 전용 쿠폰"),
      number: coupon.number,
      eventName: coupon.eventName,
      until: coupon.until,
    })
    if (!saved) setError(t("이미지를 만들지 못했어요. 화면을 캡처해 주세요."))
  }

  const hide = (coupon: WalletCoupon) => {
    hideCoupon(coupon.code, coupon.id)
    setCoupons(walletCoupons(savedCheckIns()))
  }

  const ready = coupons.filter((coupon) => coupon.state === "ready").length

  return (
    <div className="checkin">
      <header className="checkin-header">
        <img alt="uniconnect" src={logo} />
      </header>

      <main className="checkin-card">
        <span className="checkin-kicker">{t("쿠폰함")}</span>
        <h1>{t("받은 쿠폰")}</h1>
        <p className="checkin-date">
          {coupons.length > 0 ? t("쓸 수 있는 쿠폰 {count}장", { count: ready }) : t("행사 QR로 받은 쿠폰이 여기 모여요.")}
        </p>
        <p className="wallet-note">{t("이 휴대폰의 이 브라우저에만 남아요. 잃어버리지 않게 이미지로도 저장해 두세요.")}</p>

        {coupons.length === 0 ? (
          <p className="wallet-empty">{t("아직 받은 쿠폰이 없어요. 행사장의 QR을 스캔해 보세요.")}</p>
        ) : (
          <ul className="coupon-list">
            {coupons.map((coupon) => (
              <li className={`coupon wallet-coupon ${coupon.state}`} key={`${coupon.code}:${coupon.id}`}>
                <span className="wallet-state">{t(stateLabel[coupon.state])}</span>
                <span className="coupon-store">{coupon.store ?? t("매장")}</span>
                <strong className="coupon-title">{coupon.title ?? t("행사 참여자 전용 쿠폰")}</strong>
                {coupon.eventName && <small>{coupon.eventName}</small>}
                <div className="coupon-code">
                  <span>{t("쿠폰 번호")}</span>
                  <strong>{coupon.number}</strong>
                  {coupon.until && <small>{couponUntilText(coupon.until, coupon.state !== "expired")}</small>}
                </div>
                <div className="wallet-actions">
                  {coupon.state === "ready" && (
                    <button
                      aria-label={t("{store} 쿠폰을 이미지로 저장", { store: coupon.store ?? t("매장") })}
                      className="coupon-save"
                      onClick={() => void keepImage(coupon)}
                      type="button"
                    >
                      <Icon name="download" size={16} /> {t("이미지로 저장")}
                    </button>
                  )}
                  <a className="coupon-save" href={`/check-in/${encodeURIComponent(coupon.code)}`}>
                    {t("행사 페이지")}
                  </a>
                  {coupon.state !== "ready" && (
                    <button
                      aria-label={t("{store} 쿠폰을 쿠폰함에서 지우기", { store: coupon.store ?? t("매장") })}
                      className="coupon-save"
                      onClick={() => hide(coupon)}
                      type="button"
                    >
                      {t("지우기")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
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
