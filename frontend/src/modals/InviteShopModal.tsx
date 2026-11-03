import { useState } from "react"

import { Modal } from "../components/Modal"
import { QrCode } from "../components/QrCode"
import { t } from "../i18n"
import { viewPath } from "../lib/route"
import type { NearbyPlace } from "../types"

// The invitation's address, which opens its page (pages/InvitePage.tsx).
export const inviteLink = (code: string) =>
  new URL(viewPath({ page: "대시보드", invite: code }), window.location.origin).href

// The message to the shop's owner, in Korean whatever language the app is
// in, as it goes to a shop in Korea (like the emails). "11월 27일" for a date.
export function inviteMessage({
  shop,
  group,
  school,
  event,
  link,
}: {
  shop: string
  group: string
  school?: string
  event?: { name: string; date: string }
  link: string
}) {
  const day = event && event.date.split("-").slice(1).map(Number)
  return [
    `안녕하세요, ${shop} 사장님.`,
    `${school ? `${school} ` : ""}${group}에서 연락드려요.`,
    event && day
      ? `다가오는 행사 '${event.name}'(${day[0]}월 ${day[1]}일)에 함께할 가게를 찾고 있어요.`
      : "학생 행사에 함께할 가게를 찾고 있어요.",
    "uniconnect는 대학생 단체와 학교 근처 가게를 잇는 협찬 서비스예요. 가입하시면 협찬 제안을 받아 보시고 행사 날 쿠폰으로 찾아온 손님과 방문 성과도 확인하실 수 있어요.",
    "아래 링크에서 가게로 가입해 주시면 협찬 제안서를 보내 드릴게요.",
    link,
  ].join("\n")
}

// A student group invites a shop from 가까운 순: the invitation's QR to show
// in person, and a message with its link to send by KakaoTalk or text.
export function InviteShopModal({
  place,
  code,
  group,
  school,
  event,
  onClose,
  onNotice,
}: {
  place: NearbyPlace
  code: string
  group: string
  school?: string
  // The group's next event, which the message names.
  event?: { name: string; date: string }
  onClose: () => void
  onNotice: (message: string) => void
}) {
  const link = inviteLink(code)
  const [message, setMessage] = useState(() => inviteMessage({ shop: place.name, group, school, event, link }))
  const canShare = typeof navigator.share === "function"

  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text)
      onNotice(done)
    } catch {
      onNotice(t("복사하지 못했어요. 직접 선택해서 복사해 주세요."))
    }
  }

  const share = async () => {
    try {
      await navigator.share({ title: t("uniconnect 초대장"), text: message })
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if ((error as Error).name !== "AbortError") onNotice(t("공유하지 못했어요. 메시지를 복사해서 보내 주세요."))
    }
  }

  return (
    <Modal name="invite" kicker="Invite" title={t("{name} 초대하기", { name: place.name })} onClose={onClose}>
      <div className="invite-content">
        <p className="auth-lead">
          {t("사장님이 이 초대장으로 가입하면 가게가 uniconnect 브랜드가 되고 바로 협찬 제안을 보낼 수 있어요.")}
        </p>
        <figure className="invite-qr">
          <div className="qr-frame">
            <QrCode label={t("{name} 초대장 QR 코드", { name: place.name })} value={link} />
          </div>
          <figcaption>{t("가게에서 직접 보여 드리면 사장님이 휴대폰 카메라로 바로 열 수 있어요.")}</figcaption>
        </figure>
        <label className="invite-message">
          {t("보낼 메시지")}
          <textarea onChange={(event) => setMessage(event.target.value)} rows={9} value={message} />
          <small className="field-hint">{t("받는 분을 위해 한국어로 적었어요. 고쳐서 보내도 돼요.")}</small>
        </label>
        <div className="qr-actions">
          <button className="cancel-button" onClick={() => void copy(link, t("초대 링크를 복사했어요."))} type="button">
            {t("링크 복사")}
          </button>
          {canShare && (
            <button className="cancel-button" onClick={() => void share()} type="button">
              {t("공유하기")}
            </button>
          )}
          <button
            className="primary-button"
            onClick={() => void copy(message, t("메시지를 복사했어요. 카카오톡이나 문자로 보내 주세요."))}
            type="button"
          >
            {t("메시지 복사")}
          </button>
        </div>
      </div>
    </Modal>
  )
}
