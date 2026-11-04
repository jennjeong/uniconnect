import { useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { reportReasons } from "../data/reports"
import { t } from "../i18n"

// 신고 대상. 리스팅의 계정, 그 계정이 보낸 메시지, 후기, 또는 후기에 대한
// 리스팅의 답글. 불리는 이름과 문제가 된 글을 함께 담는다.
export type SafetyTarget =
  | { kind: "account"; listingId: string; name: string }
  | { kind: "message"; conversationId: string; messageId: string; name: string; text: string }
  | { kind: "review"; reviewKey: string; name: string; text: string }
  | { kind: "reply"; reviewKey: string; name: string; text: string }

// 서버가 받는 형식(routes/reports.ts).
const maxDetail = 300

// 신고하기: 이유(목록 중 하나)와 회원의 말로 쓴 일의 경위. 운영자가 /admin에서
// 본다. 차단하기(계정에만): 둘이 서로를 보지 않게 되며 내 정보에서 되돌릴 수
// 있다.
export function SafetyModal({
  mode,
  target,
  onClose,
  onDone,
}: {
  mode: "report" | "block"
  target: SafetyTarget
  onClose: () => void
  // 서버가 받은 뒤, 회원에게 알려 줄 내용과 함께.
  onDone: (notice: string) => void
}) {
  const [reason, setReason] = useState(reportReasons[0])
  const [detail, setDetail] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  const run = async (change: () => Promise<unknown>, notice: string) => {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await change()
      onDone(notice)
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  if (mode === "block" && target.kind === "account") {
    return (
      <Modal kicker="Block" name="safety" onClose={onClose} title={t("{name} 차단", { name: target.name })}>
        <div className="auth-form">
          <p className="auth-lead">
            {t("차단하면 서로 목록에서 보이지 않고 제안과 메시지도 주고받을 수 없어요. 이미 확정된 협찬은 그대로예요. 내 정보에서 언제든 풀 수 있어요.")}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="decline-button wide"
            disabled={busy}
            onClick={() => void run(() => api.block(target.listingId), t("차단했어요. 내 정보에서 풀 수 있어요."))}
            type="button"
          >
            {t("차단하기")}
          </button>
        </div>
      </Modal>
    )
  }

  const body =
    target.kind === "account"
      ? { kind: target.kind, listingId: target.listingId }
      : target.kind === "message"
        ? { kind: target.kind, conversationId: target.conversationId, messageId: target.messageId }
        : { kind: target.kind, reviewKey: target.reviewKey }

  return (
    <Modal kicker="Report" name="safety" onClose={onClose} title={t("{name} 신고", { name: target.name })}>
      <form
        className="auth-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (reason === "기타" && !detail.trim()) {
            setError(t("어떤 일인지 적어 주세요."))
            return
          }
          void run(
            () => api.report({ ...body, reason, detail: detail.trim() }),
            t("신고했어요. 운영자가 확인할게요."),
          )
        }}
      >
        <p className="auth-lead">
          {target.kind === "account"
            ? t("이 상대의 소개나 행동에 문제가 있으면 알려 주세요. 운영자만 봐요.")
            : target.kind === "message"
              ? t("이 메시지를 운영자에게 알려요. 상대에게는 알리지 않아요.")
              : target.kind === "reply"
                ? t("이 답글을 운영자에게 알려요. 쓴 쪽에는 알리지 않아요.")
                : t("이 후기를 운영자에게 알려요. 쓴 사람에게는 알리지 않아요.")}
        </p>
        {target.kind !== "account" && target.text && <blockquote className="safety-quote">{target.text}</blockquote>}
        <div aria-label={t("신고 사유")} className="ask-categories" role="radiogroup">
          {reportReasons.map((item) => (
            <button
              aria-checked={reason === item}
              className={reason === item ? "ask-category active" : "ask-category"}
              key={item}
              onClick={() => setReason(item)}
              role="radio"
              type="button"
            >
              {t(item)}
            </button>
          ))}
        </div>
        <label>
          {reason === "기타" ? t("어떤 일인지") : t("덧붙일 말 (선택)")}
          <textarea
            className="propose-message"
            maxLength={maxDetail}
            onChange={(event) => setDetail(event.target.value)}
            placeholder={t("언제, 어떤 일이 있었는지 적어 주시면 확인이 빨라요.")}
            rows={3}
            value={detail}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button wide" disabled={busy} type="submit">
          {t("신고 보내기")}
        </button>
      </form>
    </Modal>
  )
}
