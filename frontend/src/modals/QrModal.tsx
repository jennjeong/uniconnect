import { useEffect, useState, type ReactNode } from "react"

import { Icon } from "../components/Icon"
import { Modal } from "../components/Modal"
import { QrCode } from "../components/QrCode"
import { RotatePin } from "../components/RotatePin"
import { t } from "../i18n"
import { checkInLink, staffCheckInLink, venueLink } from "../lib/checkin"
import { formatFullDate } from "../lib/date"
import type { Report, VenuePage } from "../types"

// 행사의 체크인 QR. 처음에는 참여자용(QR, 행사명, 안내)만 보여서 그대로 행사장에
// 띄워도 된다. 매장 직원용·단체용 주소와 PIN은 '운영자용'을 따로 눌러야 보이고,
// '행사장에 띄우기'는 QR과 안내만 화면 가득 보여 준다. 협찬사의 매장 PIN은 서버가
// 단체에게 보내지 않으므로, 단체에게는 그 PIN이 어디 있는지만 알려 준다.
export function QrModal({
  report,
  onClose,
  onCopied,
  onRotatePin,
}: {
  report: Report
  onClose: () => void
  onCopied: (message: string) => void
  onRotatePin: (page: VenuePage) => Promise<unknown>
}) {
  const link = checkInLink(report)
  const staffLink = staffCheckInLink(report)
  const groupLink = venueLink(report.code, "group")
  const [view, setView] = useState<"public" | "operators">("public")
  const [presenting, setPresenting] = useState(false)
  const hasOperatorInfo = Boolean(report.staffPin || report.groupPin || report.pinsFrom)

  // 주소를 그대로 복사하고 결과를 알린다(보이는 줄바꿈은 복사에 들어가지 않는다).
  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value)
      onCopied(done)
    } catch {
      onCopied(t("링크를 복사하지 못했어요. 직접 선택해서 복사해 주세요."))
    }
  }

  const participantQr = (
    <>
      <div className="qr-frame">
        <QrCode label={t("{name} 참여 QR 코드", { name: report.eventName })} value={link} />
      </div>
      <strong>{report.eventName}</strong>
      <span>{t("휴대폰 카메라로 QR을 찍고 참여해 주세요")}</span>
    </>
  )

  // 띄운 화면은 Escape로 끝낸다(팝업으로 돌아간다).
  useEffect(() => {
    if (!presenting) return
    const stop = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPresenting(false)
    }
    window.addEventListener("keydown", stop)
    return () => window.removeEventListener("keydown", stop)
  }, [presenting])

  if (presenting) {
    return (
      <div className="qr-present" role="dialog" aria-modal="true" aria-label={t("행사장에 띄운 참여 QR")}>
        <div className="qr-present-body">{participantQr}</div>
        <button className="cancel-button" onClick={() => setPresenting(false)} type="button">
          {t("띄우기 끝내기")}
        </button>
      </div>
    )
  }

  return (
    <Modal name="qr" kicker="Live QR" title={t("현장 참여 QR")} onClose={onClose}>
      {/* 제목과 닫기는 그대로 두고 이 안만 세로로 스크롤한다. */}
      <div className="qr-body">
      {hasOperatorInfo && (
        <div aria-label={t("보기")} className="qr-views" role="tablist">
          <button
            aria-selected={view === "public"}
            className={view === "public" ? "active" : undefined}
            onClick={() => setView("public")}
            role="tab"
            type="button"
          >
            {t("참여자용")}
          </button>
          <button
            aria-selected={view === "operators"}
            className={view === "operators" ? "active" : undefined}
            onClick={() => setView("operators")}
            role="tab"
            type="button"
          >
            {t("운영자용 PIN")}
          </button>
        </div>
      )}

      {view === "public" ? (
        <div className="qr-content">
          {participantQr}
          <small className="qr-date">
            {formatFullDate(report.eventDate)} · {t("행사장 입구와 부스에 띄워 주세요")}
          </small>
          <code className="qr-link">{link}</code>
          <div className="qr-actions">
            <button className="cancel-button" onClick={() => copy(link, t("참여 링크를 복사했어요."))} type="button">
              {t("참여 링크 복사")}
            </button>
            <button className="primary-button" onClick={() => setPresenting(true)} type="button">
              {t("행사장에 띄우기")}
            </button>
            <a className="detail-button" href={link} rel="noreferrer" target="_blank">
              {t("참여 화면 열기")} <Icon name="arrow" size={16} />
            </a>
          </div>
        </div>
      ) : (
        <div className="qr-content operators">
          <p className="qr-warning">
            {t("이 화면은 행사장에 띄우지 마세요. 주소와 PIN은 매장 직원과 우리 단체 담당자에게만 따로 알려 주세요.")}
          </p>
          {report.pinsFrom && (
            <p className="field-hint">
              {t("직원 PIN과 단체 확인 PIN은 행사 하루 전인 {date}부터 여기에 보여요.", { date: formatFullDate(report.pinsFrom) })}
            </p>
          )}
          {(report.staffPin || (report.groupPin && report.sponsors?.length)) && (
            <OperatorCard
              title={t("매장 직원용 방문 확인")}
              address={staffLink}
              copyLabel={t("직원용 주소 복사")}
              onCopy={() => copy(staffLink, t("매장 직원용 주소를 복사했어요."))}
            >
              {report.staffPin &&
                (report.sponsors?.length ? (
                  <ul className="qr-pins">
                    {report.sponsors.map((sponsor) => (
                      <li key={sponsor.id}>
                        <span>
                          {sponsor.brandName} · {sponsor.coupon.store}
                        </span>
                        <span className="qr-pin-value">
                          {t("직원 PIN")} <strong>{sponsor.staffPin}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="qr-pin-value">
                    {t("직원 PIN")} <strong>{report.staffPin}</strong>
                  </p>
                ))}
              {report.staffPin && report.canRotatePin && !report.sponsors?.length && (
                <RotatePin misses={report.pinMisses} onRotate={() => onRotatePin("staff")} />
              )}
              <small>
                {report.staffPin
                  ? t("직원이 자기 기기에서 참여자의 쿠폰 번호를 넣으면 방문이 기록돼요.")
                  : t("매장 직원 PIN은 협찬 브랜드만 계약서에서 확인해요. 방문 확인은 매장이 직접 해서, 우리 단체에는 보이지 않아요.")}
                {report.staffPin &&
                  report.sponsors &&
                  report.sponsors.length > 1 &&
                  ` ${t("매장마다 PIN이 달라서, 각 매장은 자기 쿠폰만 확인할 수 있어요.")}`}
              </small>
            </OperatorCard>
          )}
          {report.groupPin && (
            <OperatorCard
              title={t("우리 단체 현장 확인")}
              address={groupLink}
              copyLabel={t("단체용 주소 복사")}
              onCopy={() => copy(groupLink, t("우리 단체용 주소를 복사했어요."))}
            >
              <p className="qr-pin-value">
                {t("단체 확인 PIN")} <strong>{report.groupPin}</strong>
              </p>
              {report.canRotatePin && <RotatePin misses={report.pinMisses} onRotate={() => onRotatePin("group")} />}
              <small>
                {t("임시 전자 계약서에서 우리 단체가 확인하기로 한 협찬 확인 방식(부스 스탬프, SNS 인증 등)을 행사 날 이 주소에서 기록해요.")}
              </small>
            </OperatorCard>
          )}
        </div>
      )}
      </div>
    </Modal>
  )
}

// 운영자용 탭의 카드 하나: 제목, 주소(칸 안에서 줄바꿈), 주소 복사·열기, 그 아래
// PIN과 설명(children).
function OperatorCard({
  title,
  address,
  copyLabel,
  onCopy,
  children,
}: {
  title: string
  address: string
  copyLabel: string
  onCopy: () => void
  children: ReactNode
}) {
  return (
    <section className="qr-op-card" aria-label={title}>
      <h3>{title}</h3>
      <code className="qr-link wrap">{address}</code>
      <div className="qr-op-actions">
        <button className="cancel-button" onClick={onCopy} type="button">
          <Icon name="copy" size={15} /> {copyLabel}
        </button>
        <a className="detail-button" href={address} rel="noreferrer" target="_blank">
          {t("열기")} <Icon name="arrowUpRight" size={15} />
        </a>
      </div>
      {children}
    </section>
  )
}
