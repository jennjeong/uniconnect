import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { Modal } from "../components/Modal"
import { inquiryCategories } from "../data/inquiries"
import { t } from "../i18n"
import { formatDateTime } from "../lib/date"
import type { Account, Inquiry } from "../types"

const maxLength = 1000

// 도움말 센터(pages/FaqPage.tsx)에서 운영자에게 묻는다. 질문은 서버가 저장한
// 뒤에야 보냄으로 보이고, 보내기가 실패하면 쓴 내용이 남는다. 계정이 한 질문은
// 입력창 아래에 목록으로 나오고 답이 오는 대로 함께 보인다.
export function AskModal({
  account,
  onLogin,
  onClose,
  onAnswersRead,
}: {
  account: Account | null
  onLogin: () => void
  onClose: () => void
  // 답변을 확인했다고 표시한 뒤의 질문.
  onAnswersRead?: (inquiries: Inquiry[]) => void
}) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [category, setCategory] = useState(inquiryCategories[0])
  const [question, setQuestion] = useState("")
  const [error, setError] = useState("")
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!account) return
    let cancelled = false
    api
      .inquiries()
      .then((result) => {
        if (cancelled) return
        setInquiries(result.inquiries)
        // 여기서 확인했으므로 벨이 답변 알림을 놓는다.
        if (!result.inquiries.some((inquiry) => inquiry.answeredAt && !inquiry.answerReadAt)) return
        api
          .readInquiryAnswers()
          .then((read) => {
            if (cancelled) return
            setInquiries(read.inquiries)
            onAnswersRead?.(read.inquiries)
          })
          .catch(() => {})
      })
      .catch((problem) => {
        if (!cancelled) setError(errorMessage(problem))
      })
    return () => {
      cancelled = true
    }
  }, [account])

  const ask = async () => {
    if (busy) return
    if (question.trim().length < 5) {
      setError(t("질문을 5자 이상 적어 주세요."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const { inquiry } = await api.askInquiry({ category, question: question.trim() })
      setInquiries((current) => [inquiry, ...current])
      setQuestion("")
      setSent(true)
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal name="ask" kicker="Ask Us" title={t("관리자에게 질문하기")} onClose={onClose}>
      <div className="ask-card">
        <p className="form-card-caption">
          {t("질문은 관리자가 확인한 뒤 답해요. 답변은 아래 ‘내 질문’에 표시돼요.")}
        </p>
        {!account ? (
          <div className="ask-login">
            <p>{t("로그인하면 관리자에게 질문하고 답변을 받아볼 수 있어요.")}</p>
            <button className="primary-button" onClick={onLogin} type="button">
              {t("로그인")}
            </button>
          </div>
        ) : (
          <>
            <div aria-label={t("질문 종류")} className="ask-categories" role="radiogroup">
              {inquiryCategories.map((item) => (
                <button
                  aria-checked={category === item}
                  className={category === item ? "ask-category active" : "ask-category"}
                  key={item}
                  onClick={() => setCategory(item)}
                  role="radio"
                  type="button"
                >
                  {t(item)}
                </button>
              ))}
            </div>
            <label className="field">
              <span>
                {t("질문 내용")}
                <em className="field-count">
                  {question.length}/{maxLength}
                </em>
              </span>
              <textarea
                maxLength={maxLength}
                onChange={(event) => {
                  setQuestion(event.target.value)
                  setSent(false)
                }}
                placeholder={t("궁금한 점을 적어 주세요. 오류라면 어느 화면에서 무엇을 눌렀는지 함께 적어 주시면 좋아요.")}
                rows={5}
                value={question}
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {sent && (
              <p className="ask-sent" role="status">
                {t("질문을 보냈어요. 관리자가 답하면 아래 ‘내 질문’에서 볼 수 있어요.")}
              </p>
            )}
            <button className="primary-button wide" disabled={busy} onClick={ask} type="button">
              {busy ? t("보내는 중…") : t("질문 보내기")}
            </button>

            <div className="ask-history">
              <p className="ask-history-title">{t("내 질문")}</p>
              {inquiries.length === 0 ? (
                <p className="day-empty">{t("아직 보낸 질문이 없어요.")}</p>
              ) : (
                <ol>
                  {inquiries.map((inquiry) => (
                    <li key={inquiry.id}>
                      <div className="ask-history-head">
                        <span className="ask-chip">{t(inquiry.category)}</span>
                        <span className={inquiry.answer ? "ask-state answered" : "ask-state"}>
                          {inquiry.answer ? t("답변 완료") : t("답변 대기")}
                        </span>
                        <time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time>
                      </div>
                      <p className="ask-question">{inquiry.question}</p>
                      {inquiry.answer && (
                        <div className="ask-answer">
                          <strong>{t("관리자 답변")}</strong>
                          <p>{inquiry.answer}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
