import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { QrCode } from "../components/QrCode"
import { checkInLink } from "../lib/checkin"
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
      onCopied("참여 링크를 복사했어요.")
    } catch {
      onCopied("링크를 복사하지 못했어요. 직접 선택해서 복사해 주세요.")
    }
  }

  return (
    <Modal name="qr" kicker="Live QR" title="현장 참여 QR" onClose={onClose}>
      <div className="qr-content">
        <div className="qr-frame">
          <QrCode label={`${report.eventName} 참여 QR 코드`} value={link} />
        </div>
        <strong>{report.eventName}</strong>
        <span>{formatFullDate(report.eventDate)} · 행사장 입구와 부스에 띄워 주세요</span>
        <code className="qr-link">{link}</code>
        {report.staffPin && (
          <p className="qr-pin">
            매장 직원 확인 PIN <strong>{report.staffPin}</strong>
            <small>협찬 매장 직원에게만 알려 주세요. 방문은 이 PIN을 넣어야 기록돼요.</small>
          </p>
        )}
        <div className="qr-actions">
          <button className="cancel-button" onClick={copy} type="button">
            링크 복사
          </button>
          <a className="primary-button" href={link} rel="noreferrer" target="_blank">
            참여 화면 열기 <Icon name="arrow" size={16} />
          </a>
        </div>
      </div>
    </Modal>
  )
}
