import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { QrCode } from "../components/QrCode"
import { t } from "../i18n"
import { checkInLink, staffCheckInLink, venueLink } from "../lib/checkin"
import { formatFullDate } from "../lib/date"
import type { Report } from "../types"

// The event's check-in QR, to show on a screen or print at the venue.
export function QrModal({
  report,
  onClose,
  onCopied,
}: {
  report: Report
  onClose: () => void
  onCopied: (message: string) => void
}) {
  const link = checkInLink(report)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      onCopied(t("참여 링크를 복사했어요."))
    } catch {
      onCopied(t("링크를 복사하지 못했어요. 직접 선택해서 복사해 주세요."))
    }
  }

  return (
    <Modal name="qr" kicker="Live QR" title={t("현장 참여 QR")} onClose={onClose}>
      <div className="qr-content">
        <div className="qr-frame">
          <QrCode label={t("{name} 참여 QR 코드", { name: report.eventName })} value={link} />
        </div>
        <strong>{report.eventName}</strong>
        <span>
          {formatFullDate(report.eventDate)} · {t("행사장 입구와 부스에 띄워 주세요")}
        </span>
        <code className="qr-link">{link}</code>
        {report.staffPin && (
          <div className="qr-pin">
            {t("매장 직원용 방문 확인")}
            <code className="qr-link">{staffCheckInLink(report)}</code>
            {report.sponsors?.length ? (
              <ul className="qr-pins">
                {report.sponsors.map((sponsor) => (
                  <li key={sponsor.id}>
                    {sponsor.brandName} · {sponsor.coupon.store} {t("직원 PIN")} <strong>{sponsor.staffPin}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <span>
                {t("직원 PIN")} <strong>{report.staffPin}</strong>
              </span>
            )}
            <small>
              {t("이 주소와 PIN은 협찬 매장 직원에게만 알려 주세요. 직원이 자기 기기에서 참여자의 쿠폰 번호를 넣으면 방문이 기록돼요.")}
              {report.sponsors &&
                report.sponsors.length > 1 &&
                ` ${t("매장마다 PIN이 달라서, 각 매장은 자기 쿠폰만 확인할 수 있어요.")}`}
            </small>
          </div>
        )}
        {report.groupPin && (
          <div className="qr-pin">
            {t("우리 단체 현장 확인")}
            <code className="qr-link">{venueLink(report.code, "group")}</code>
            <span>
              {t("단체 확인 PIN")} <strong>{report.groupPin}</strong>
            </span>
            <small>
              {t("임시 전자 계약서에서 우리 단체가 확인하기로 한 협찬 확인 방식(부스 스탬프, SNS 인증 등)을 행사 날 이 주소에서 기록해요. 우리 단체 담당자에게만 알려 주세요.")}
            </small>
          </div>
        )}
        <div className="qr-actions">
          <button className="cancel-button" onClick={copy} type="button">
            {t("링크 복사")}
          </button>
          <a className="primary-button" href={link} rel="noreferrer" target="_blank">
            {t("참여 화면 열기")} <Icon name="arrow" size={16} />
          </a>
        </div>
      </div>
    </Modal>
  )
}
