import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { formatDay, toIsoDate } from "../lib/date"
import type { Conversation } from "../types"

// How often an open conversation checks for new messages.
const refreshMs = 4000

const timeOf = (at: string) =>
  new Date(at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })

// One conversation: messages (own on the right), and a box to write more.
// It checks for replies every few seconds while open.
export function ChatPage({
  id,
  onBack,
  onOpenPartner,
  onChange,
}: {
  id: string
  onBack: () => void
  // Opens the partner's detail page; absent when it can't be opened.
  onOpenPartner?: (partnerId: string) => void
  // Receives the conversation after each load or send (for unread counts).
  onChange: (conversation: Conversation) => void
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const lastCount = useRef(0)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .conversation(id)
        .then(({ conversation: loaded }) => {
          if (cancelled) return
          setConversation(loaded)
          onChange(loaded)
        })
        .catch((problem) => {
          if (!cancelled) setError(errorMessage(problem))
        })
    load()
    const timer = window.setInterval(load, refreshMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [id, onChange])

  // New messages scroll into view.
  const count = conversation?.messages?.length ?? 0
  useEffect(() => {
    if (count === lastCount.current) return
    const smooth = lastCount.current > 0
    lastCount.current = count
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [count])

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const { conversation: updated } = await api.sendMessage(id, text)
      setConversation(updated)
      onChange(updated)
      setDraft("")
      setError("")
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setSending(false)
    }
  }

  // Enter sends; Shift+Enter starts a new line. Korean input finishes its
  // syllable first.
  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  const partner = conversation?.partner
  let lastDay = ""

  return (
    <section className="page-view chat-view">
      <PageIntro
        onBack={onBack}
        eyebrow={partner?.school ?? partner?.category ?? "Chat"}
        title={partner?.name ?? "대화"}
        actions={
          partner &&
          onOpenPartner && (
            <button className="detail-button" onClick={() => onOpenPartner(partner.id)} type="button">
              상세 정보 <Icon name="arrowUpRight" size={15} />
            </button>
          )
        }
      />

      {partner && !partner.hasAccount && (
        <p className="chat-note">
          아직 uniconnect 계정이 없는 상대예요. 메시지는 남겨 두고, 계정이 연결되면 바로 볼 수
          있어요.
        </p>
      )}

      <ol className="chat-thread">
        {(conversation?.messages ?? []).map((message) => {
          const day = toIsoDate(new Date(message.at))
          const newDay = day !== lastDay
          lastDay = day
          return (
            <li className={message.mine ? "chat-message mine" : "chat-message"} key={message.id}>
              {newDay && <span className="chat-day">{formatDay(day)}</span>}
              <div className="chat-bubble">{message.text}</div>
              <time dateTime={message.at}>{timeOf(message.at)}</time>
            </li>
          )
        })}
        {conversation && count === 0 && (
          <li className="chat-start">첫 메시지로 궁금한 점을 물어보세요.</li>
        )}
      </ol>

      <div className="chat-composer">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="chat-input">
          <textarea
            aria-label="메시지"
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={sendOnEnter}
            placeholder="메시지를 입력하세요"
            rows={1}
            value={draft}
          />
          <button
            aria-label="보내기"
            className="primary-button"
            disabled={!draft.trim() || sending}
            onClick={send}
            type="button"
          >
            <Icon name="send" size={17} />
          </button>
        </div>
      </div>
    </section>
  )
}
