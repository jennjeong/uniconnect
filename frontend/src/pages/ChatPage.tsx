import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react"

import { ApiError, api, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { SearchClear } from "../components/SearchClear"
import { PageIntro } from "../components/PageIntro"
import { locale, t } from "../i18n"
import { formatDay, todayIso, toIsoDate } from "../lib/date"
import { saveFile } from "../lib/download"
import { photoFromFile } from "../lib/image"
import { googleMeetingLink, meetingIcs } from "../lib/meetings"
import type { ChatAttachment, ChatMessage, Conversation, Meeting } from "../types"

// 요청이 실패한 뒤 열린 대화가 다시 묻기까지 기다리는 시간.
const retryMs = 4000

// 서버가 받는 최대 크기의 PDF(routes/conversations.ts).
const pdfMaxBytes = 2 * 1024 * 1024

// 손가락을 내 메시지에 올려 두면 메뉴가 열리기까지 걸리는 시간.
const holdMs = 450

// 이 사용자가 메시지 메뉴를 한 번 열면 저장해서, 여는 방법을 알려 주는 줄을
// 더는 보이지 않는다.
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

// 고른 PDF를 data URL로. 시스템이 타입을 주지 않아도 PDF 타입으로 만든다.
const pdfDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;,]*;base64,/, "data:application/pdf;base64,"))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

// 대화로 보낸 사진. 로그인 토큰으로 가져와서(<img>는 토큰을 보낼 수 없다) 객체
// URL로 보여 주며, 탭에서 원래 크기로 열린다.
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

// 대화로 보낸 PDF: 이름과 크기를 보여 주고 누르면 저장된다.
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

// 대화 하나: 메시지(내 것은 오른쪽)와 더 쓰는 입력창. 열려 있고 보이는 동안은
// 서버에 요청 하나를 걸어 두고, 서버가 무언가 바뀌는 즉시 답하므로 답장, 상대의
// 읽음 표시, 수정, 삭제가 바로 보인다. 내 메시지는 읽혔는지를 보여 주고
// 메뉴에서 고치거나 지울 수 있다. 터치 화면에서는 길게 누르고, 마우스는 오른쪽
// 클릭하며, 키보드는 ⋯ 버튼으로 연다. 이후 양쪽에 "수정됨"이나 지워진 메시지가
// 대신 보인다. 사진이나 PDF는 입력창 옆 클립으로 보내며 따로 하나의 메시지가
// 되고, 지울 수는 있지만 고칠 수는 없다. 대화가 사라지면 확인을 멈추고, 만료된
// 로그인은 앱에 넘긴다.
const meetingLengths = [30, 60, 90, 120]

const meetingStates: Record<Meeting["status"], string> = {
  proposed: "답을 기다려요",
  accepted: "확정된 미팅",
  declined: "거절된 미팅",
  canceled: "취소된 미팅",
}

// 대화에서 제안한 미팅: 언제, 얼마 동안, 어디서, 진행 상태, 이쪽이 줄 수 있는
// 답. 수락되면 양쪽이 캘린더에 넣을 수 있다.
function MeetingCard({
  message,
  partnerName,
  busy,
  onAnswer,
}: {
  message: ChatMessage & { meeting: Meeting }
  partnerName: string
  busy: boolean
  onAnswer: (answer: "accept" | "decline" | "cancel") => void
}) {
  const { meeting } = message
  const title = t("{name} 미팅", { name: partnerName })
  const note = message.text.startsWith("미팅 제안:") ? "" : message.text
  return (
    <div className={`meeting-card ${meeting.status}`}>
      <span className="meeting-kicker">
        <Icon name="calendar" size={14} /> {t("미팅 제안")} · {t(meetingStates[meeting.status])}
      </span>
      <strong>
        {formatDay(meeting.date)} {meeting.time} · {t("{minutes}분", { minutes: meeting.minutes })}
      </strong>
      <span className="meeting-place">{meeting.place}</span>
      {note && <p>{note}</p>}
      <div className="meeting-actions">
        {!message.mine && meeting.status === "proposed" && (
          <>
            <button className="primary-button" disabled={busy} onClick={() => onAnswer("accept")} type="button">
              {t("수락")}
            </button>
            <button className="cancel-button" disabled={busy} onClick={() => onAnswer("decline")} type="button">
              {t("거절")}
            </button>
          </>
        )}
        {meeting.status === "accepted" && (
          <>
            <a className="cancel-button" href={googleMeetingLink(meeting, title)} rel="noreferrer" target="_blank">
              {t("Google 캘린더에 추가")}
            </a>
            <button
              className="cancel-button"
              onClick={() => saveFile(`uniconnect-meeting-${meeting.date}.ics`, meetingIcs(meeting, title, message.id), "text/calendar")}
              type="button"
            >
              {t("캘린더 파일로 저장")}
            </button>
          </>
        )}
        {message.mine && (meeting.status === "proposed" || meeting.status === "accepted") && (
          <button className="underline-link" disabled={busy} onClick={() => onAnswer("cancel")} type="button">
            {t("미팅 취소")}
          </button>
        )}
      </div>
    </div>
  )
}

// 미팅 잡기: 제안할 미팅의 날, 시작, 길이, 장소와 메모. 따로 하나의 메시지로
// 보낸다.
function MeetingForm({
  busy,
  onSend,
  onClose,
}: {
  busy: boolean
  onSend: (body: { date: string; time: string; minutes: number; place: string; note?: string }) => Promise<boolean>
  onClose: () => void
}) {
  const [date, setDate] = useState("")
  const [time, setTime] = useState("14:00")
  const [minutes, setMinutes] = useState(60)
  const [place, setPlace] = useState("")
  const [note, setNote] = useState("")
  return (
    <form
      aria-label={t("미팅 잡기")}
      className="meeting-form"
      onSubmit={async (event) => {
        event.preventDefault()
        if (await onSend({ date, time, minutes, place: place.trim(), ...(note.trim() ? { note: note.trim() } : {}) })) onClose()
      }}
    >
      <label>
        {t("날짜")}
        <input min={todayIso()} onChange={(event) => setDate(event.target.value)} required type="date" value={date} />
      </label>
      <label>
        {t("시작 시각")}
        <input onChange={(event) => setTime(event.target.value)} required step={600} type="time" value={time} />
      </label>
      <label>
        {t("미팅 시간")}
        <select onChange={(event) => setMinutes(Number(event.target.value))} value={minutes}>
          {meetingLengths.map((length) => (
            <option key={length} value={length}>
              {t("{minutes}분", { minutes: length })}
            </option>
          ))}
        </select>
      </label>
      <label className="wide">
        {t("장소 또는 화상 회의 링크")}
        <input maxLength={100} onChange={(event) => setPlace(event.target.value)} placeholder={t("예) 학생회관 2층 카페, Zoom 링크")} required value={place} />
      </label>
      <label className="wide">
        {t("메모 (선택)")}
        <input maxLength={300} onChange={(event) => setNote(event.target.value)} placeholder={t("예) 협찬 물품과 부스 위치를 같이 정해요.")} value={note} />
      </label>
      <div className="meeting-form-actions wide">
        <button className="underline-link" onClick={onClose} type="button">
          {t("닫기")}
        </button>
        <button className="primary-button" disabled={busy || !date || !place.trim()} type="submit">
          {t("미팅 제안 보내기")}
        </button>
      </div>
    </form>
  )
}

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
  // 사진과 PDF를 보낼 수 있는지. 공용 데모 계정은 보낼 수 없다.
  canSendFiles: boolean
  onBack: () => void
  // 파트너의 상세 페이지를 연다. 열 수 없으면 없다.
  onOpenPartner?: (partnerId: string) => void
  // 불러오거나 보낼 때마다 대화를 받는다(안 읽은 수 계산용).
  onChange: (conversation: Conversation) => void
  // 401로 불린다. 로그인이 만료되었다.
  onSessionEnd: (error: unknown) => void
  // 파트너의 메시지 하나를 신고한다. 데모 계정에는 없다.
  onReport?: (message: ChatMessage) => void
}) {
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [draft, setDraft] = useState("")
  const [error, setError] = useState("")
  const [sending, setSending] = useState(false)
  const [query, setQuery] = useState("")
  const [uploading, setUploading] = useState(false)
  // 열려 있는 동안의 미팅 잡기 폼과, 보내거나 답하는 중인 미팅.
  const [planning, setPlanning] = useState(false)
  const [meetingBusy, setMeetingBusy] = useState(false)
  // 작업 메뉴가 열린 내 메시지와, 삭제 확인을 묻는 중인지 여부.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  // 입력창에서 고치는 메시지. 그 전에 입력하던 내용은 고친 뒤로 미룬다.
  const [editing, setEditing] = useState<ChatMessage | null>(null)
  // 내 메시지에 손가락을 올린 상태: 닿은 위치와, 움직이거나(스크롤) 먼저 떼지
  // 않으면 메뉴를 여는 타이머.
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null)
  // 길게 눌러 메뉴가 열렸을 때 설정한다. 손가락을 뗄 때의 클릭이 사진을 열거나
  // 파일을 저장하지 않게 한다.
  const heldOpen = useRef(false)
  // 메뉴를 한 번 열 때까지 입력창 위의 한 줄이 여는 방법을 알려 준다.
  const [hintShown, setHintShown] = useState(() => !menuKnown())
  const [touch] = useState(() => window.matchMedia("(hover: none)").matches)
  const keptDraft = useRef("")
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastCount = useRef(0)
  // 보내기, 수정, 삭제마다 올라서 그 전에 시작한 확인이 이전 메시지를 되돌려
  // 놓지 못하게 한다.
  const changes = useRef(0)

  useEffect(() => {
    let cancelled = false
    const aborter = new AbortController()
    const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
    // 숨겨진 페이지는 기다리는 요청을 두지 않고 다시 보일 때 다시 묻는다.
    const shown = () =>
      document.hidden
        ? new Promise<void>((resolve) => {
            const seen = () => {
              if (document.hidden) return
              document.removeEventListener("visibilitychange", seen)
              resolve()
            }
            document.addEventListener("visibilitychange", seen)
          })
        : Promise.resolve()
    const listen = async () => {
      // 페이지가 서버가 찍은 대로 보여 주는 것. 없으면 바로 묻는다.
      let stamp: string | undefined
      while (!cancelled) {
        await shown()
        if (cancelled) return
        const startedAt = changes.current
        try {
          const { conversation: loaded, stamp: next } = await api.conversation(id, stamp, aborter.signal)
          if (cancelled) return
          // 그 사이 보내기, 수정, 삭제로 더 새로운 메시지가 보이면 바로 다시
          // 묻는다.
          if (startedAt !== changes.current) {
            stamp = undefined
            continue
          }
          stamp = next
          setConversation(loaded)
          onChange(loaded)
          setError("")
        } catch (problem) {
          if (cancelled) return
          if (problem instanceof ApiError && problem.status === 401) {
            onSessionEnd(problem)
            return
          }
          setError(errorMessage(problem))
          // 파트너가 떠났거나 대화가 사라졌다. 더 기다릴 것이 없다.
          if (problem instanceof ApiError && problem.status === 404) return
          stamp = undefined
          await pause(retryMs)
        }
      }
    }
    void listen()
    return () => {
      cancelled = true
      aborter.abort()
    }
  }, [id, onChange, onSessionEnd])

  // 새 메시지가 보이도록 스크롤한다.
  const count = conversation?.messages?.length ?? 0
  useEffect(() => {
    if (count === lastCount.current) return
    const smooth = lastCount.current > 0
    lastCount.current = count
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? "smooth" : "auto" })
  }, [count])

  // 열린 메뉴는 아래에 고정된 입력창에 가리지 않게 스크롤한다.
  useEffect(() => {
    if (menuFor) document.querySelector(".chat-actions")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [menuFor, confirming])

  // 열린 메시지 메뉴는 다른 곳을 누르거나 Escape를 누르면 닫힌다.
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

  // 페이지가 사라질 때 아직 재는 중인 길게 누르기는 아무것도 열지 않는다.
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

  // 고른 사진은 크기를 줄여(lib/image.ts), PDF는 그대로 2MB까지 보낸다.
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
      // 읽을 수 없는 사진은 이유를 알려 준다(lib/image.ts).
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

  const proposeMeeting = async (body: { date: string; time: string; minutes: number; place: string; note?: string }) => {
    setMeetingBusy(true)
    try {
      update((await api.proposeMeeting(id, body)).conversation)
      return true
    } catch (problem) {
      fail(problem)
      return false
    } finally {
      setMeetingBusy(false)
    }
  }

  const answerMeeting = async (message: ChatMessage, answer: "accept" | "decline" | "cancel") => {
    setMeetingBusy(true)
    try {
      update((await api.answerMeeting(id, message.id, answer)).conversation)
    } catch (problem) {
      fail(problem)
    } finally {
      setMeetingBusy(false)
    }
  }

  // 내 메시지의 작업을 연다. 한 번 열면 힌트는 할 일을 다한 것이다.
  const openMenu = (message: ChatMessage) => {
    setConfirming(false)
    setMenuFor(message.id)
    if (!hintShown) return
    setHintShown(false)
    try {
      localStorage.setItem(menuKnownKey, "1")
    } catch {
      // 사생활 보호 브라우징에서는 힌트가 다음에도 그냥 다시 보인다.
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

  // 터치 화면에서는 길게 누르면 메뉴가 열리고(Safari는 이때 contextmenu
  // 이벤트를 보내지 않는다) 마우스는 오른쪽 버튼으로 연다.
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

  // 움직이는 손가락은 길게 누르는 것이 아니라 스크롤하는 것이다.
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

  // Enter는 보내기(또는 수정 저장), Shift+Enter는 줄바꿈, Escape는 수정 중단.
  // 한글 입력은 음절을 먼저 마친다.
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
  const all = conversation?.messages ?? []
  const words = query.trim().toLowerCase()
  const shown = words
    ? all.filter((message) => !message.deletedAt && `${message.text} ${message.attachment?.name ?? ""}`.toLowerCase().includes(words))
    : all

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
          {t("아직 uniconnect 계정이 없는 상대예요. 메시지는 남겨 두고 계정이 연결되면 바로 볼 수 있어요.")}
        </p>
      )}

      {all.length > 0 && (
        <div className="chat-search">
          <Icon name="search" size={16} />
          <input
            aria-label={t("대화 검색")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("대화 검색")}
            type="search"
            value={query}
          />
          <SearchClear onClear={() => setQuery("")} value={query} />
        </div>
      )}
      {words && (
        <p className="chat-search-count" role="status">
          {shown.length > 0 ? t("{count}개를 찾았어요.", { count: shown.length }) : t("맞는 메시지가 없어요.")}
        </p>
      )}

      <ol className="chat-thread">
        {shown.map((message) => {
          const day = toIsoDate(new Date(message.at))
          const newDay = day !== lastDay
          lastDay = day
          const deleted = Boolean(message.deletedAt)
          // 내 메시지는 고칠 수 있고(파일은 삭제만), 계정이 있는 파트너의
          // 메시지는 신고할 수 있다.
          const own = message.mine && !deleted
          const editable = own && !message.attachment && !message.meeting
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
                ) : message.meeting ? (
                  <MeetingCard
                    busy={meetingBusy}
                    message={{ ...message, meeting: message.meeting }}
                    onAnswer={(answer) => void answerMeeting(message, answer)}
                    partnerName={partner?.name ?? ""}
                  />
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
        {planning && <MeetingForm busy={meetingBusy} onClose={() => setPlanning(false)} onSend={proposeMeeting} />}
        <div className="chat-input">
          {partner?.hasAccount && !editing && (
            <button
              aria-expanded={planning}
              aria-label={t("미팅 잡기")}
              className="chat-attach chat-meeting"
              onClick={() => setPlanning(!planning)}
              type="button"
            >
              <Icon name="calendar" size={19} />
            </button>
          )}
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
