import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { FaqList } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { Presence } from "../components/Presence"
import { RevealTitle } from "../components/RevealText"
import { SearchClear } from "../components/SearchClear"
import { faqTopics, type FaqTopic } from "../data/faq"
import { useFaqs } from "../hooks/useSiteState"
import { t, tc } from "../i18n"
import { AskModal } from "../modals/AskModal"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, Inquiry } from "../types"

// 검색은 공백과 대소문자를 가리지 않는다.
const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase()

// 도움말 센터: 무엇을 도와줄지 묻는 짙은 파란색 배너, 질문 검색, 운영자에게
// 묻는 상자(modals/AskModal.tsx)를 여는 링크, 질문을 하나로 좁히는 카드형 주제,
// 그리고 질문 목록. 검색어를 입력하는 동안 맞는 질문이 상자 아래에 내려와 고를
// 수 있고(화살표와 Enter도 된다) 고르면 목록에서 그 질문이 열린다.
export function FaqPage({
  account,
  askNow = false,
  onAsked,
  onAnswersRead,
  onLogin,
}: {
  account: Account | null
  // 벨의 답변 알림처럼 질문을 바로 연다.
  askNow?: boolean
  onAsked?: () => void
  onAnswersRead?: (inquiries: Inquiry[]) => void
  onLogin: () => void
}) {
  const faqs = useFaqs()
  const [query, setQuery] = useState("")
  const [topic, setTopic] = useState<FaqTopic | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const helpBox = useRef<HTMLInputElement>(null)
  const [asking, setAsking] = useState(askNow)
  // 벨의 답변 알림에서 열린 경우. 이미 여기 있어도 열리며, 한 번만 열고 다음
  // 방문에는 다시 열지 않는다.
  useEffect(() => {
    if (!askNow) return
    setAsking(true)
    onAsked?.()
  }, [askNow, onAsked])
  // 검색 상자 아래의 추천 목록과, 화살표가 가 있는 항목.
  const [suggesting, setSuggesting] = useState(false)
  const [active, setActive] = useState(-1)
  // 선택이 연 질문. 목록에 보이면 그곳으로 스크롤한다.
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
          <span className="eyebrow light">{tc("eyebrow", "고객센터")}</span>
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
            ref={helpBox}
            role="combobox"
            type="search"
            value={query}
          />
          <SearchClear
            onClear={() => {
              setQuery("")
              setTopic(null)
              setActive(-1)
              setPicked(undefined)
              helpBox.current?.focus()
            }}
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
                  // 상자가 포커스를 잃기 전에 해서 선택이 반영되게 한다.
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
