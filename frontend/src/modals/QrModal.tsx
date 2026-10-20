import { Modal } from "../components/Modal"

export function QrModal({
  onClose,
  onScan,
}: {
  onClose: () => void
  onScan: () => void
}) {
  return (
    <Modal name="qr" kicker="LIVE QR" title="현장 참여 QR" onClose={onClose}>
      <div className="qr-content">
        <div className="qr-code" role="img" aria-label="가상 현장 참여 QR 코드">
          {Array.from({ length: 64 }, (_, index) => (
            <span
              className={(index * 7 + (index % 5)) % 3 ? "filled" : ""}
              key={index}
            />
          ))}
        </div>
        <strong>가을 버스킹 데이</strong>
        <span>UNICONNECT-EVENT-1012</span>
        <button className="primary-button wide" onClick={onScan} type="button">
          테스트 스캔 기록
        </button>
      </div>
    </Modal>
  )
}
