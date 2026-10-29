import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"

import { ApiError, api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { locale, t } from "../i18n"
import { formatDay, toIsoDate } from "../lib/date"
import { saveFile } from "../lib/download"
import { photoFromFile } from "../lib/image"
import type { ChatAttachment, ChatMessage, Conversation } from "../types"

// How often an open conversation checks for new messages.
const refreshMs = 4000

// As large a PDF as the server takes (routes/conversations.ts).
const pdfMaxBytes = 2 * 1024 * 1024

// How long a finger rests on an own message before its menu opens.
const holdMs = 450

// Kept once this viewer has opened a message's menu, so the line saying how
// to open it stops showing.
const menuKnownKey = "uniconnect:chat-menu-known"

const menuKnown = () => {
  try {
    return localStorage.getItem(menuKnownKey) === "1"
  } catch {
    return false
  }
}

const timeOf = (at: string) =>
  new Date(at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })

const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`

// A picked PDF as a data URL, typed as a PDF even when the system gave it no type.
const pdfDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*;base64,/, "data:application/pdf;base64,"))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// A photo sent in the conversation, fetched with the login token (an <img>
// can't send it) and shown from an object URL; it opens full size in a tab.
function ChatPhoto({ conversationId, attachment, alt }: { conversationId: string; attachment: ChatAttachment; alt: string }) {
  const [url, setUrl] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let objectUrl: string | undefined
    let cancelled = false
    api.chatFile(conversationId, attachment.file).then(
      (blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      },
      () => {
        if (!cancelled) setFailed(true)
      },
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [conversationId, attachment.file])
  if (failed) return <span className="chat-photo-wait">{t("사진을 불러오지 못했어요.")}</span>
  return url ? (
    <a className="chat-photo" href={url} rel="noreferrer" target="_blank">
      <img alt={alt} src={url} />
    </a>
  ) : (
    <span aria-hidden="true" className="chat-photo-wait" />
  )
}

// A PDF sent in the conversation: its name and size, saved when pressed.
function ChatFile({
  conversationId,
  attachment,
  onError,
}: {
  conversationId: string
  attachment: ChatAttachment
  onError: (problem: unknown) => void
}) {
  const save = async () => {
    try {
      saveFile(attachment.name, await api.chatFile(conversationId, attachment.file), "application/pdf")
    } catch (problem) {
      onError(problem)
    }
  }
  return (
    <button className="chat-file" onClick={() => void save()} type="button">
      <Icon name="file" size={20} />
      <span>
        <strong>{attachment.name}</strong>
        <small>
          PDF · {sizeOf(attachment.size)} · {t("저장")}
        </small>
      </span>
    </button>
  )
}

// One conversation: messages (own on the right), and a box to write more.
// It checks for replies every few seconds while open, which also brings in
// the partner's read marks, edits and deletions. Own messages say whether
// they were read and can be edited or deleted from a menu: pressed and held
// on a touch screen, right-clicked with a mouse, or opened from a ⋯ button
// the keyboard reaches. Both sides then see "수정됨" or a deleted message in
// its place. A photo or PDF goes from the clip beside the box as a message
// of its own, which can be deleted but not edited. It stops checking once
// the conversation is gone, and hands an expired login to the app.
export function ChatPage({
  id,
  canSendFiles,
  onBack,
  onOpenPartner,
  onChange,
  onSessionEnd,
  onReport,
}: {
  id: string
  // Whether photos and PDFs can be sent: not from the shared demo accounts.
  canSendFiles: boolean
  onBack: () => void
  // Opens the partner's detail page; absent when it can't be opened.
  onOpenPartner?: (partnerId: string) => void
  // Receives the conversation after each load or send (for unread counts).
  onChange: (conversation: Conversation) => void
  // Called with a 401: the login ran out.
  onSessionEnd: (error: unknown) => void
  // Reports one of the partner's messages; absent for the demo accounts.
  onReport?: (message: ChatMessage) => void
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  // The own message whose actions are open, and whether they ask to confirm a delete.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // The message being edited in the box; what was typed before waits for after.
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  // A finger resting on an own message: where it went down, and the timer
  // that opens the menu unless it moves (to scroll) or lifts first.
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  // Set when a hold opened the menu, so the click as the finger lifts
  // doesn't also open a photo or save a file.
  const heldOpen = useRef(false)
  // Until a menu has been opened once, a line over the box says how.
  const [hintShown, setHintShown] = useState(() => !menuKnown())
  const [touch] = useState(() => window.matchMedia("(hover: none)").matches)
  const keptDraft = useRef("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastCount = useRef(0)
  // Moves on with every send, edit or delete, so a check that started
  // before one cannot put the older messages back.
  const changes = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    // Only the newest check applies, whatever order the answers come in.
    let latest = 0
    const stop = () => window.clearInterval(timer)
    const load = () => {
      const check = ++latest
      const startedAt = changes.current
      api
        .conversation(id)
        .then(({ conversation: loaded }) => {
          if (cancelled || check !== latest || startedAt !== changes.current) return
          setConversation(loaded)
          onChange(loaded)
          setError("")
        })
        .catch((problem) => {
          if (cancelled) return
          if (problem instanceof ApiError && problem.status === 401) {
            stop()
            onSessionEnd(problem)
            return
          }
          // The partner left or the conversation is gone: nothing more to check.
          if (problem instanceof ApiError && problem.status === 404) stop()
          setError(errorMessage(problem))
        })
    }
    load()
    timer = window.setInterval(load, refreshMs)
    return () => {
      cancelled = true
      stop()
    }
  }, [id, onChange, onSessionEnd])

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
    const closeOutside = (event: globalThis.PointerEvent) => {
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

  // A hold still timing when the page goes opens nothing.
  useEffect(
    () => () => {
      if (hold.current) window.clearTimeout(hold.current.timer)
    },
    [],
  )

  const update = (updated: Conversation) => {
    changes.current += 1
    setConversation(updated)
    onChange(updated)
    setError("")
  }

  const fail = (problem: unknown) => {
    if (problem instanceof ApiError && problem.status === 401) onSessionEnd(problem)
    else setError(errorMessage(problem))
  }

  // A picked photo goes resized (lib/image.ts), a PDF as it is, up to 2 MB.
  const sendFile = async (file: File) => {
    if (uploading) return
    const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
    if (pdf && file.size > pdfMaxBytes) {
      setError(t("PDF는 2MB까지 보낼 수 있어요."))
      return
    }
    setUploading(true)
    try {
      const data = pdf ? await pdfDataUrl(file) : await photoFromFile(file)
      update((await api.sendFile(id, data, file.name)).conversation)
    } catch (problem) {
      // A photo that can't be read says why (lib/image.ts).
      if (problem instanceof Error && !(problem instanceof ApiError)) setError(problem.message)
      else fail(problem)
    } finally {
      setUploading(false)
    }
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
      fail(problem)
    } finally {
      setSending(false)
    }
  }

  // Opens an own message's actions; once it has, the hint has done its job.
  const openMenu = (message: ChatMessage) => {
    setConfirming(false)
    setMenuFor(message.id)
    if (!hintShown) return
    setHintShown(false)
    try {
      localStorage.setItem(menuKnownKey, "1")
    } catch {
      // Private browsing: the hint simply shows again next time.
    }
  }

  const toggleMenu = (message: ChatMessage) => {
    if (menuFor !== message.id) return openMenu(message)
    setMenuFor(null)
    setConfirming(false)
  }

  const endHold = () => {
    if (hold.current) window.clearTimeout(hold.current.timer)
    hold.current = null
  }

  // A press and hold opens the menu on touch screens (Safari sends no
  // contextmenu event for it); a mouse opens it with the right button.
  const startHold = (event: PointerEvent<HTMLDivElement>, message: ChatMessage) => {
    heldOpen.current = false
    if (event.pointerType === "mouse") return
    endHold()
    const timer = window.setTimeout(() => {
      hold.current = null
      heldOpen.current = true
      navigator.vibrate?.(10)
      openMenu(message)
    }, holdMs)
    hold.current = { timer, x: event.clientX, y: event.clientY }
  }

  // A finger that moves is scrolling, not holding.
  const moveHold = (event: PointerEvent<HTMLDivElement>) => {
    if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) endHold()
  }

  const openOnRightClick = (event: MouseEvent<HTMLDivElement>, message: ChatMessage) => {
    event.preventDefault()
    endHold()
    openMenu(message)
  }

  const swallowHeldClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!heldOpen.current) return
    heldOpen.current = false
    event.preventDefault()
    event.stopPropagation()
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
      fail(problem)
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
  const ownSent = (conversation?.messages ?? []).some((message) => message.mine && !message.deletedAt)
  let lastDay = ""

  return (
    <section className="page-view chat-view">
      <PageIntro
        onBack={onBack}
        eyebrow={partner?.school ?? (partner?.category ? t(partner.category) : "Chat")}
        title={partner?.name ?? t("대화")}
        actions={
          partner &&
          onOpenPartner && (
            <button className="detail-button" onClick={() => onOpenPartner(partner.id)} type="button">
              {t("상세 정보")} <Icon name="arrowUpRight" size={15} />
            </button>
          )
        }
      />

      {partner && !partner.hasAccount && (
        <p className="chat-note">
          {t("아직 uniconnect 계정이 없는 상대예요. 메시지는 남겨 두고, 계정이 연결되면 바로 볼 수 있어요.")}
        </p>
      )}

      <ol className="chat-thread">
        {(conversation?.messages ?? []).map((message) => {
          const day = toIsoDate(new Date(message.at))
          const newDay = day !== lastDay
          lastDay = day
          const deleted = Boolean(message.deletedAt)
          // Own messages are edited (files only deleted), a partner with an account's reported.
          const own = message.mine && !deleted
          const editable = own && !message.attachment
          const reportable = !message.mine && !deleted && onReport !== undefined && partner?.hasAccount === true
          const actionable = own || reportable
          const classes = [
            "chat-message",
            message.mine && "mine",
            deleted && "deleted",
            editing?.id === message.id && "editing",
            message.attachment && (message.attachment.type === "image" ? "has-photo" : "has-file"),
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <li className={classes} key={message.id}>
              {newDay && <span className="chat-day">{formatDay(day)}</span>}
              <div
                className="chat-bubble"
                onClickCapture={actionable ? swallowHeldClick : undefined}
                onContextMenu={actionable ? (event) => openOnRightClick(event, message) : undefined}
                onPointerCancel={actionable ? endHold : undefined}
                onPointerDown={actionable ? (event) => startHold(event, message) : undefined}
                onPointerMove={actionable ? moveHold : undefined}
                onPointerUp={actionable ? endHold : undefined}
              >
                {deleted ? (
                  message.mine ? t("메시지를 삭제했어요.") : t("삭제된 메시지예요.")
                ) : message.attachment?.type === "image" ? (
                  <ChatPhoto
                    alt={message.mine ? t("보낸 사진") : t("받은 사진")}
                    attachment={message.attachment}
                    conversationId={id}
                  />
                ) : message.attachment ? (
                  <ChatFile attachment={message.attachment} conversationId={id} onError={fail} />
                ) : (
                  message.text
                )}
              </div>
              <span className="chat-meta">
                {message.editedAt && !deleted && <span className="chat-edited">{t("수정됨")}</span>}
                {own && (
                  <span className={message.read ? "chat-read read" : "chat-read"}>
                    {message.read ? t("읽음") : t("안 읽음")}
                  </span>
                )}
                <time dateTime={message.at}>{timeOf(message.at)}</time>
                {actionable && (
                  <button
                    aria-expanded={menuFor === message.id}
                    aria-label={own ? (editable ? t("메시지 수정 또는 삭제") : t("메시지 삭제")) : t("메시지 신고")}
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
                      <span>{t("삭제하면 상대에게도 삭제된 메시지로 보여요.")}</span>
                      <button className="chat-action danger" onClick={() => remove(message)} type="button">
                        {t("삭제")}
                      </button>
                      <button className="chat-action" onClick={() => setConfirming(false)} type="button">
                        {t("취소")}
                      </button>
                    </>
                  ) : reportable ? (
                    <button
                      className="chat-action danger"
                      onClick={() => {
                        setMenuFor(null)
                        onReport?.(message)
                      }}
                      type="button"
                    >
                      {t("신고하기")}
                    </button>
                  ) : (
                    <>
                      {editable && (
                        <button className="chat-action" onClick={() => startEdit(message)} type="button">
                          <Icon name="edit" size={15} />
                          {t("수정")}
                        </button>
                      )}
                      <button className="chat-action danger" onClick={() => setConfirming(true)} type="button">
                        <Icon name="trash" size={15} />
                        {t("삭제")}
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {conversation && count === 0 && (
          <li className="chat-start">{t("첫 메시지로 궁금한 점을 물어보세요.")}</li>
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
            <span>{t("메시지 수정 중 · 고치면 상대에게도 수정됨으로 보여요.")}</span>
            <button className="subtle-link" onClick={cancelEdit} type="button">
              {t("취소")}
            </button>
          </div>
        )}
        {uploading && (
          <p className="chat-hint" role="status">
            <Icon name="clip" size={14} />
            {t("파일을 보내고 있어요…")}
          </p>
        )}
        {hintShown && ownSent && !editing && !uploading && (
          <p className="chat-hint">
            <Icon name="edit" size={14} />
            {touch
              ? t("내 메시지를 꾹 누르면 수정하거나 삭제할 수 있어요.")
              : t("내 메시지를 우클릭하면 수정하거나 삭제할 수 있어요.")}
          </p>
        )}
        <div className="chat-input">
          {canSendFiles && !editing && (
            <label className="chat-attach" aria-disabled={uploading || undefined}>
              <Icon name="clip" size={19} />
              <span className="sr-only">{t("사진이나 PDF 보내기")}</span>
              <input
                accept="image/*,application/pdf,.pdf"
                className="sr-only"
                disabled={uploading}
                onChange={(changed) => {
                  const file = changed.target.files?.[0]
                  changed.target.value = ""
                  if (file) void sendFile(file)
                }}
                type="file"
              />
            </label>
          )}
          <textarea
            aria-label={editing ? t("고칠 메시지") : t("보낼 메시지")}
            maxLength={1000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={sendOnEnter}
            placeholder={editing ? t("고칠 내용을 입력하세요") : t("메시지를 입력하세요")}
            ref={inputRef}
            rows={1}
            value={draft}
          />
          <button
            aria-label={editing ? t("수정 완료") : t("보내기")}
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
