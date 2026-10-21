import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { formatDay, toIsoDate } from "../lib/date"
import type { ChatMessage, Conversation } from "../types"

// How often an open conversation checks for new messages.
const refreshMs = 4000

const timeOf = (at: string) =>
  new Date(at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })

// One conversation: messages (own on the right), and a box to write more.
// It checks for replies every few seconds while open, which also brings in
// the partner's read marks, edits and deletions. Own messages say whether
// they were read and can be edited or deleted from their ⋯ button; both
// sides then see "수정됨" or a deleted message in its place.
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
  // The own message whose actions are open, and whether they ask to confirm a delete.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // The message being edited in the box; what was typed before waits for after.
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  const keptDraft = useRef("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
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

  // An opened menu scrolls clear of the message box held at the bottom.
  useEffect(() => {
    if (menuFor) document.querySelector(".chat-actions")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [menuFor, confirming])

  // An open message menu closes on a press anywhere else, or Escape.
  useEffect(() => {
    if (!menuFor) return
    const close = () => {
      setMenuFor(null)
      setConfirming(false)
    }
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".chat-actions, .chat-more")) return
      close()
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") close()
    }
    document.addEventListener("pointerdown", closeOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [menuFor])

  const update = (updated: Conversation) => {
    setConversation(updated)
    onChange(updated)
    setError("")
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const { conversation: updated } = editing
        ? await api.editMessage(id, editing.id, text)
        : await api.sendMessage(id, text)
      update(updated)
      setDraft(editing ? keptDraft.current : "")
      setEditing(null)
    } catch (problem) {
      setError(errorMessage(problem))
    } finally {
      setSending(false)
    }
  }

  const toggleMenu = (message: ChatMessage) => {
    setConfirming(false)
    setMenuFor((open) => (open === message.id ? null : message.id))
  }

  const startEdit = (message: ChatMessage) => {
    if (!editing) keptDraft.current = draft
    setEditing(message)
    setDraft(message.text)
    setMenuFor(null)
    inputRef.current?.focus()
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft(keptDraft.current)
  }

  const remove = async (message: ChatMessage) => {
    setMenuFor(null)
    setConfirming(false)
    try {
      const { conversation: updated } = await api.deleteMessage(id, message.id)
      update(updated)
      if (editing?.id === message.id) cancelEdit()
    } catch (problem) {
      setError(errorMessage(problem))
    }
  }

  // Enter sends (or saves an edit); Shift+Enter starts a new line; Escape
  // stops editing. Korean input finishes its syllable first.
  const sendOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape" && editing) {
      event.preventDefault()
      cancelEdit()
      return
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  const partner = conversation?.partner
  const unchanged = editing !== null && draft.trim() === editing.text
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
          const deleted = Boolean(message.deletedAt)
          const classes = [
            "chat-message",
            message.mine && "mine",
            deleted && "deleted",
            editing?.id === message.id && "editing",
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <li className={classes} key={message.id}>
              {newDay && <span className="chat-day">{formatDay(day)}</span>}
              <div className="chat-bubble">
                {deleted ? (message.mine ? "메시지를 삭제했어요." : "삭제된 메시지예요.") : message.text}
              </div>
              <span className="chat-meta">
                {message.editedAt && !deleted && <span className="chat-edited">수정됨</span>}
                {message.mine && !deleted && (
                  <span className={message.read ? "chat-read read" : "chat-read"}>
                    {message.read ? "읽음" : "안 읽음"}
                  </span>
                )}
                <time dateTime={message.at}>{timeOf(message.at)}</time>
                {message.mine && !deleted && (
                  <button
                    aria-expanded={menuFor === message.id}
                    aria-label="메시지 수정 또는 삭제"
                    className="chat-more"
                    onClick={() => toggleMenu(message)}
                    type="button"
                  >
                    <Icon name="more" size={16} />
                  </button>
                )}
              </span>
              {menuFor === message.id && (
                <div className="chat-actions">
                  {confirming ? (
                    <>
                      <span>삭제하면 상대에게도 삭제된 메시지로 보여요.</span>
                      <button className="chat-action danger" onClick={() => remove(message)} type="button">
                        삭제
                      </button>
                      <button className="chat-action" onClick={() => setConfirming(false)} type="button">
                        취소
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="chat-action" onClick={() => startEdit(message)} type="button">
                        <Icon name="edit" size={15} />
                        수정
                      </button>
                      <button className="chat-action danger" onClick={() => setConfirming(true)} type="button">
                        <Icon name="trash" size={15} />
                        삭제
                      </button>
                    </>
                  )}
                </div>
              )}
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
        {editing && (
          <div className="chat-editing">
            <Icon name="edit" size={15} />
            <span>메시지 수정 중 · 고치면 상대에게도 수정됨으로 보여요.</span>
            <button className="subtle-link" onClick={cancelEdit} type="button">
              취소
            </button>
          </div>
        )}
        <div className="chat-input">
          <textarea
            aria-label={editing ? "고칠 메시지" : "메시지"}
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={sendOnEnter}
            placeholder={editing ? "고칠 내용을 입력하세요" : "메시지를 입력하세요"}
            ref={inputRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label={editing ? "수정 완료" : "보내기"}
            className="primary-button"
            disabled={!draft.trim() || sending || unchanged}
            onClick={send}
            type="button"
          >
            <Icon name={editing ? "check" : "send"} size={17} />
          </button>
        </div>
      </div>
    </section>
  )
}
