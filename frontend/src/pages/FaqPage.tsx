import { useEffect, useRef, useState, type FormEvent } from "react"

import { api, errorMessage } from "../api"
import { FaqList } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { RevealTitle } from "../components/RevealText"
import { faqs, faqTopics, type FaqTopic } from "../data/faq"
import { inquiryCategories } from "../data/inquiries"
import { formatDateTime } from "../lib/date"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, Inquiry } from "../types"

const maxLength = 1000

// Spaces and case don't matter to the search.
const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase()

// The help center: a deep blue banner asking how it can help, with a search
// over the questions and a link to ask the operators; the topics as cards
// that narrow the questions to one; then the questions, and beside them a
// box for asking the operators what they don't answer. A question shows as
// sent only once the server has stored it; if sending fails, what was
// written stays. The account's own questions are listed under the box with
// the answers as they come.
export function FaqPage({ account, onLogin }: { account: Account | null; onLogin: () => void }) {
  const [query, setQuery] = useState("")
  const [topic, setTopic] = useState<FaqTopic | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const askRef = useRef<HTMLElement>(null)
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
        if (!cancelled) setInquiries(result.inquiries)
      })
      .catch((problem) => {
        if (!cancelled) setError(errorMessage(problem))
      })
    return () => {
      cancelled = true
    }
  }, [account])

  const words = normalize(query)
  const shown = faqs.filter(
    (item) =>
      (!topic || item.topic === topic) &&
      (!words || normalize(item.question + item.answer).includes(words)),
  )
  const topicTitle = faqTopics.find((item) => item.key === topic)?.title

  const showList = () => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  const search = (event: FormEvent) => {
    event.preventDefault()
    setTopic(null)
    showList()
  }

  const pickTopic = (key: FaqTopic) => {
    setTopic(key)
    setQuery("")
    showList()
  }

  const goAsk = () => {
    askRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    askRef.current?.querySelector<HTMLElement>("textarea, button")?.focus({ preventScroll: true })
  }

  const ask = async () => {
    if (busy) return
    if (question.trim().length < 5) {
      setError("질문을 5자 이상 적어 주세요.")
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
    <section className="page-view faq-page">
      <header className="help-hero">
        <MeshBackdrop seed={5.3} />
        <div className="help-hero-top">
          <span className="eyebrow light">Help center</span>
          <button className="help-contact" onClick={goAsk} type="button">
            관리자에게 질문하기 <Icon name="arrowUpRight" size={15} />
          </button>
        </div>
        <RevealTitle className="help-title">무엇을 도와드릴까요?</RevealTitle>
        <form className="help-search" onSubmit={search} role="search">
          <Icon name="search" size={18} />
          <input
            aria-label="자주 묻는 질문 검색"
            onChange={(event) => {
              setQuery(event.target.value)
              setTopic(null)
            }}
            placeholder="궁금한 내용 검색 (예: 제안 취소)"
            type="search"
            value={query}
          />
          <button type="submit">검색</button>
        </form>
      </header>

      <ul aria-label="도움말 주제" className="help-topics stagger">
        {faqTopics.map((item) => {
          const count = faqs.filter((faq) => faq.topic === item.key).length
          return (
            <li key={item.key}>
              <button
                aria-pressed={topic === item.key}
                className={topic === item.key ? "help-topic active" : "help-topic"}
                onClick={() => pickTopic(item.key)}
                type="button"
              >
                <span className="help-topic-icon">
                  <Icon name={item.icon} size={22} />
                </span>
                <strong>{item.title}</strong>
                <span>{item.description}</span>
                <small>질문 {count}개</small>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="faq-layout">
        <div className="help-results" ref={listRef}>
          <div className="help-results-head">
            <h2>{words ? `‘${query.trim()}’ 검색 결과` : (topicTitle ?? "모든 질문")}</h2>
            {(words || topic) && (
              <button
                className="underline-link"
                onClick={() => {
                  setQuery("")
                  setTopic(null)
                }}
                type="button"
              >
                모든 질문 보기
              </button>
            )}
          </div>
          {shown.length === 0 ? (
            <div className="help-empty">
              <p>찾는 답이 없어요. 관리자에게 직접 물어보세요.</p>
              <button className="primary-button" onClick={goAsk} type="button">
                관리자에게 질문하기
              </button>
            </div>
          ) : (
            <FaqList items={shown} key={`${topic}-${words}`} />
          )}
        </div>

        <aside aria-labelledby="ask-title" className="form-card ask-card" ref={askRef}>
          <h3 className="form-card-title" id="ask-title">
            관리자에게 질문하기
          </h3>
          <p className="form-card-caption">
            질문은 관리자가 확인한 뒤 답해요. 답변은 아래 ‘내 질문’에 표시돼요.
          </p>

          {!account ? (
            <div className="ask-login">
              <p>로그인하면 관리자에게 질문하고 답변을 받아볼 수 있어요.</p>
              <button className="primary-button" onClick={onLogin} type="button">
                로그인
              </button>
            </div>
          ) : (
            <>
              <div aria-label="질문 종류" className="ask-categories" role="radiogroup">
                {inquiryCategories.map((item) => (
                  <button
                    aria-checked={category === item}
                    className={category === item ? "ask-category active" : "ask-category"}
                    key={item}
                    onClick={() => setCategory(item)}
                    role="radio"
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="field">
                <span>
                  질문 내용
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
                  placeholder="궁금한 점을 적어 주세요. 오류라면 어느 화면에서 무엇을 눌렀는지 함께 적어 주시면 좋아요."
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
                  질문을 보냈어요. 관리자가 답하면 아래 ‘내 질문’에서 볼 수 있어요.
                </p>
              )}
              <button className="primary-button wide" disabled={busy} onClick={ask} type="button">
                {busy ? "보내는 중…" : "질문 보내기"}
              </button>

              <div className="ask-history">
                <p className="ask-history-title">내 질문</p>
                {inquiries.length === 0 ? (
                  <p className="day-empty">아직 보낸 질문이 없어요.</p>
                ) : (
                  <ol>
                    {inquiries.map((inquiry) => (
                      <li key={inquiry.id}>
                        <div className="ask-history-head">
                          <span className="ask-chip">{inquiry.category}</span>
                          <span className={inquiry.answer ? "ask-state answered" : "ask-state"}>
                            {inquiry.answer ? "답변 완료" : "답변 대기"}
                          </span>
                          <time dateTime={inquiry.createdAt}>{formatDateTime(inquiry.createdAt)}</time>
                        </div>
                        <p className="ask-question">{inquiry.question}</p>
                        {inquiry.answer && (
                          <div className="ask-answer">
                            <strong>관리자 답변</strong>
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
        </aside>
      </div>
    </section>
  )
}
