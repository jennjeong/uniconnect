import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { FaqList } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { Presence } from "../components/Presence"
import { RevealTitle } from "../components/RevealText"
import { faqTopics, type FaqTopic } from "../data/faq"
import { useFaqs } from "../hooks/useSiteState"
import { t } from "../i18n"
import { AskModal } from "../modals/AskModal"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, Inquiry } from "../types"

// Spaces and case don't matter to the search.
const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase()

// The help center: a deep blue banner asking how it can help, with a search
// over the questions and the link that opens the box for asking the
// operators (modals/AskModal.tsx); the topics as cards that narrow the
// questions to one; then the questions. While a search is typed, the
// questions it matches drop down under the box to pick from (arrow keys
// and Enter work too); a pick opens that question in the list.
export function FaqPage({
  account,
  askNow = false,
  onAsked,
  onAnswersRead,
  onLogin,
}: {
  account: Account | null
  // Opens the questions at once, as the bell's notice of an answer does.
  askNow?: boolean
  onAsked?: () => void
  onAnswersRead?: (inquiries: Inquiry[]) => void
  onLogin: () => void
}) {
  const faqs = useFaqs()
  const [query, setQuery] = useState("")
  const [topic, setTopic] = useState<FaqTopic | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState(askNow)
  // Opened from the bell's notice of an answer, even while already here;
  // once, not again on the next visit.
  useEffect(() => {
    if (!askNow) return
    setAsking(true)
    onAsked?.()
  }, [askNow, onAsked])
  // The suggestion list under the search box, and the one the arrows are on.
  const [suggesting, setSuggesting] = useState(false)
  const [active, setActive] = useState(-1)
  // The question a pick opened, scrolled to once the list shows it.
  const [picked, setPicked] = useState<string>()

  const words = normalize(query)
  const shown = faqs.filter(
    (item) =>
      (!topic || item.topic === topic) &&
      (!words || normalize(item.question + item.answer).includes(words)),
  )
  const topicTitle = faqTopics.find((item) => item.key === topic)?.title
  const suggestions = words
    ? faqs.filter((item) => normalize(item.question + item.answer).includes(words)).slice(0, 5)
    : []
  const listOpen = suggesting && suggestions.length > 0

  useEffect(() => {
    if (!picked) return
    const item = listRef.current?.querySelector<HTMLElement>(`[data-question="${CSS.escape(picked)}"]`)
    item?.scrollIntoView({ behavior: "smooth", block: "center" })
    item?.querySelector("summary")?.focus({ preventScroll: true })
  }, [picked])

  const pick = (question: string) => {
    setQuery("")
    setTopic(null)
    setSuggesting(false)
    setActive(-1)
    setPicked(question)
  }

  const moveThroughSuggestions = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!listOpen) return
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((current) => (current + step + suggestions.length) % suggestions.length)
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault()
      pick(suggestions[active].question)
    } else if (event.key === "Escape") {
      setSuggesting(false)
    }
  }

  const showList = () => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  const search = (event: FormEvent) => {
    event.preventDefault()
    setTopic(null)
    setSuggesting(false)
    showList()
  }

  const pickTopic = (key: FaqTopic) => {
    setTopic(key)
    setQuery("")
    showList()
  }

  const goAsk = () => setAsking(true)

  return (
    <section className="page-view faq-page">
      <header className="help-hero">
        <MeshBackdrop seed={5.3} />
        <div className="help-hero-top">
          <span className="eyebrow light">Help Center</span>
          <button className="help-contact" onClick={goAsk} type="button">
            {t("관리자에게 질문하기")} <Icon name="arrowUpRight" size={15} />
          </button>
        </div>
        <RevealTitle className="help-title">{t("무엇을 도와드릴까요?")}</RevealTitle>
        <form className="help-search" onSubmit={search} role="search">
          <Icon name="search" size={18} />
          <input
            aria-activedescendant={listOpen && active >= 0 ? `help-suggestion-${active}` : undefined}
            aria-autocomplete="list"
            aria-controls="help-suggestions"
            aria-expanded={listOpen}
            aria-label={t("자주 묻는 질문 검색")}
            onBlur={() => setSuggesting(false)}
            onChange={(event) => {
              setQuery(event.target.value)
              setTopic(null)
              setSuggesting(true)
              setActive(-1)
              setPicked(undefined)
            }}
            onFocus={() => setSuggesting(true)}
            onKeyDown={moveThroughSuggestions}
            placeholder={t("궁금한 내용 검색 (예: 제안 취소)")}
            role="combobox"
            type="search"
            value={query}
          />
          <button type="submit">{t("검색")}</button>
          {listOpen && (
            <ul className="help-suggestions" id="help-suggestions" role="listbox">
              {suggestions.map((item, index) => (
                <li
                  aria-selected={index === active}
                  className={index === active ? "active" : undefined}
                  id={`help-suggestion-${index}`}
                  key={item.question}
                  // Before the box loses focus, so the pick lands.
                  onMouseDown={(event) => {
                    event.preventDefault()
                    pick(item.question)
                  }}
                  onMouseEnter={() => setActive(index)}
                  role="option"
                >
                  <Icon name="search" size={15} />
                  <span>{item.question}</span>
                  <small>{faqTopics.find((topicItem) => topicItem.key === item.topic)?.title}</small>
                </li>
              ))}
            </ul>
          )}
        </form>
      </header>

      <ul aria-label={t("도움말 주제")} className="help-topics stagger">
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
                <small>{count === 1 ? t("질문 1개") : t("질문 {count}개", { count })}</small>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="help-results" ref={listRef}>
        <div className="help-results-head">
          <h2>{words ? t("‘{query}’ 검색 결과", { query: query.trim() }) : (topicTitle ?? t("자주 묻는 질문"))}</h2>
          {(words || topic) && (
            <button
              className="underline-link"
              onClick={() => {
                setQuery("")
                setTopic(null)
              }}
              type="button"
            >
              {t("자주 묻는 질문 전체 보기")}
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <div className="help-empty">
            <p>{t("찾는 답이 없어요. 관리자에게 직접 물어보세요.")}</p>
            <button className="primary-button" onClick={goAsk} type="button">
              {t("관리자에게 질문하기")}
            </button>
          </div>
        ) : (
          <FaqList items={shown} key={`${topic}-${words}-${picked}`} openQuestion={picked} />
        )}
      </div>

      <Presence show={asking}>
        <AskModal
          account={account}
          onAnswersRead={onAnswersRead}
          onClose={() => setAsking(false)}
          onLogin={() => {
            setAsking(false)
            onLogin()
          }}
        />
      </Presence>
    </section>
  )
}
