import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"

import { api, ApiError, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Presence } from "../components/Presence"
import { Pill } from "../components/Pill"
import { ReviewCard, ReviewReply } from "../components/ReviewCard"
import { starPath } from "../components/Stars"
import { carriers, trackingLink } from "../data/carriers"
import { methodInfo, methodKinds, sortedMethods } from "../data/methods"
import { reviewTags } from "../data/reviews"
import { locale, t } from "../i18n"
import { venueLink } from "../lib/checkin"
import { formatDateTime, formatFullDate } from "../lib/date"
import { photoFromFile } from "../lib/image"
import { fullWon } from "../lib/sponsorships"
import { PaymentModal } from "../modals/PaymentModal"
import type { Agreement, AgreementItem, ChatSide, MeasureMethod, MethodKind, MethodSide, Metrics, Review, Shipment } from "../types"
import { agreementState } from "./AgreementsPage"

const ThanksCardExport = lazy(() => import("../report/ThanksCard").then((module) => ({ default: module.ThanksCardExport })))

// 증빙 사진. 로그인 토큰으로 가져와서(<img>는 토큰을 보낼 수 없다) 객체 URL로
// 보여 주며, 누르면 원래 크기로 열린다.
function ProofPhoto({ agreementId, photo, onRemove }: { agreementId: string; photo: string; onRemove?: () => void }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let objectUrl: string | undefined
    let cancelled = false
    api.agreementPhoto(agreementId, photo).then(
      (blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      },
      () => undefined,
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [agreementId, photo])
  return (
    <li className="agreement-photo">
      {url ? (
        <a href={url} rel="noreferrer" target="_blank">
          <img alt={t("증빙 사진")} src={url} />
        </a>
      ) : (
        <span aria-hidden="true" className="agreement-photo-wait" />
      )}
      {onRemove && (
        <button aria-label={t("사진 지우기")} className="agreement-remove" onClick={onRemove} type="button">
          <Icon name="close" size={12} />
        </button>
      )}
    </li>
  )
}

// 항목 하나: 완료 여부(해당 쪽이 누른다)와 그 링크와 사진(해당 쪽이 더하고
// 지운다).
function ItemRow({
  agreementId,
  item,
  mine,
  busy,
  onUpdate,
  onAddPhoto,
  onRemovePhoto,
}: {
  agreementId: string
  item: AgreementItem
  mine: boolean
  busy: boolean
  onUpdate: (body: { done?: boolean; links?: string[] }) => Promise<boolean>
  onAddPhoto: (file: File) => void
  onRemovePhoto: (photo: string) => void
}) {
  const [link, setLink] = useState("")
  // 체크 칸은 바로 체크되고 저장이 실패하면 되돌아간다.
  const [ticking, setTicking] = useState<boolean>()
  const tick = async (done: boolean) => {
    setTicking(done)
    await onUpdate({ done })
    setTicking(undefined)
  }
  const addLink = async () => {
    if (!link.trim()) return
    if (await onUpdate({ links: [...item.links, link.trim()] })) setLink("")
  }
  return (
    <li className={item.doneAt ? "agreement-item done" : "agreement-item"}>
      <label className="agreement-check">
        <input
          checked={ticking ?? Boolean(item.doneAt)}
          disabled={!mine || busy}
          onChange={(event) => void tick(event.target.checked)}
          type="checkbox"
        />
        <span>{item.label}</span>
        {item.doneAt && <small>{t("{date} 완료", { date: formatDateTime(item.doneAt) })}</small>}
      </label>
      {(item.links.length > 0 || item.photos.length > 0) && (
        <div className="agreement-proof">
          {item.links.length > 0 && (
            <ul className="agreement-links">
              {item.links.map((href) => (
                <li key={href}>
                  <a href={href} rel="noopener noreferrer" target="_blank">
                    <Icon name="link" size={14} />
                    <span>{href.replace(/^https?:\/\//, "")}</span>
                    <span className="sr-only">{t("(새 창)")}</span>
                  </a>
                  {mine && (
                    <button
                      aria-label={t("링크 지우기")}
                      className="agreement-remove"
                      disabled={busy}
                      onClick={() => void onUpdate({ links: item.links.filter((entry) => entry !== href) })}
                      type="button"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {item.photos.length > 0 && (
            <ul className="agreement-photos">
              {item.photos.map((photo) => (
                <ProofPhoto
                  agreementId={agreementId}
                  key={photo}
                  onRemove={mine ? () => onRemovePhoto(photo) : undefined}
                  photo={photo}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {mine && (
        <div className="agreement-add">
          <input
            aria-label={t("{label} 증빙 링크", { label: item.label })}
            inputMode="url"
            onChange={(event) => setLink(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void addLink()
              }
            }}
            placeholder={t("SNS 게시물이나 사진첩 링크")}
            type="url"
            value={link}
          />
          <button className="cancel-button" disabled={busy || !link.trim()} onClick={() => void addLink()} type="button">
            {t("링크 추가")}
          </button>
          {item.photos.length < 3 && (
            <label className="cancel-button agreement-upload">
              {t("사진 추가")}
              <input
                accept="image/*"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (file) onAddPhoto(file)
                }}
                type="file"
              />
            </label>
          )}
        </div>
      )}
    </li>
  )
}

type Draft = { id?: string; side: ChatSide; label: string }

// 쓰는 중인 항목: 각 쪽의 목록, 항목의 문구, 추가와 삭제. 저장하면 양쪽이 다시
// 확인해야 한다.
function ItemsEditor({
  agreement,
  busy,
  onCancel,
  onSave,
}: {
  agreement: Agreement
  busy: boolean
  onCancel: () => void
  onSave: (items: Draft[]) => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    agreement.items.map(({ id, side, label }) => ({ id, side, label })),
  )
  const names: Record<ChatSide, string> = { group: agreement.group.name, brand: agreement.brand.name }
  const update = (index: number, next: Partial<Draft>) =>
    setDrafts(drafts.map((draft, at) => (at === index ? { ...draft, ...next } : draft)))
  return (
    <div className="agreement-editor">
      <p className="field-hint">{t("고치고 저장하면 두 쪽 모두 다시 확인해야 해요. 그대로 둔 할 일의 링크와 사진은 남아요.")}</p>
      <ul>
        {drafts.map((draft, index) => (
          <li key={draft.id ?? `new-${index}`}>
            <select
              aria-label={t("할 사람")}
              onChange={(event) => update(index, { side: event.target.value as ChatSide })}
              value={draft.side}
            >
              <option value="brand">{names.brand}</option>
              <option value="group">{names.group}</option>
            </select>
            <input
              aria-label={t("할 일")}
              maxLength={80}
              onChange={(event) => update(index, { label: event.target.value })}
              value={draft.label}
            />
            <button
              aria-label={t("할 일 지우기")}
              className="agreement-remove"
              disabled={drafts.length <= 1}
              onClick={() => setDrafts(drafts.filter((_, at) => at !== index))}
              type="button"
            >
              <Icon name="close" size={12} />
            </button>
          </li>
        ))}
      </ul>
      <div className="agreement-editor-actions">
        {drafts.length < 12 && (
          <button
            className="cancel-button"
            onClick={() => setDrafts([...drafts, { side: agreement.side, label: "" }])}
            type="button"
          >
            <Icon name="plus" size={14} /> {t("할 일 더하기")}
          </button>
        )}
        <span />
        <button className="cancel-button" onClick={onCancel} type="button">
          {t("취소")}
        </button>
        <button className="primary-button" disabled={busy} onClick={() => onSave(drafts)} type="button">
          {t("저장")}
        </button>
      </div>
    </div>
  )
}

// 행사 목표: 행사를 가진 쪽이 행사가 시작하기 전까지 앱의 목표 폼으로 여기서
// 정하고 상대는 읽는다. 측정은 이 목표를 향해 센다.
function GoalsPanel({ agreement, onEdit }: { agreement: Agreement; onEdit?: (eventId: string) => void }) {
  const { event, goals } = agreement
  if (!event) return null
  const mine = event.owner === agreement.side
  const count = (value: number) => value.toLocaleString(locale)
  const rows = goals
    ? [
        { label: t("예상 인원"), value: t("{count}명", { count: count(goals.expectedAudience) }) },
        { label: t("도달"), value: t("{count}명", { count: count(goals.targets.reach) }) },
        { label: t("QR 스캔"), value: t("{count}건", { count: count(goals.targets.scans) }) },
        { label: t("쿠폰 수령"), value: t("{count}건", { count: count(goals.targets.coupons) }) },
        { label: t("매장 방문"), value: t("{count}건", { count: count(goals.targets.visits) }) },
        { label: t("추정 ROAS"), value: `${count(goals.targets.roas)}%` },
      ]
    : []
  return (
    <section className="agreement-section goals-panel">
      <h2>
        {t("행사 목표")}
        <small>
          {event.started
            ? t("행사가 시작돼 목표를 더 바꿀 수 없어요")
            : mine
              ? t("행사 전까지 여기서 정하고 고칠 수 있어요")
              : t("{name}에서 행사 전까지 정해요", { name: agreement[event.owner].name })}
        </small>
      </h2>
      {rows.length > 0 && (
        <dl className="goals-list">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {mine && !event.started && onEdit && (
        <div className="goals-actions">
          <Pill onClick={() => onEdit(event.id)} variant="outline">
            {t("목표 정하기")}
          </Pill>
          <p className="field-hint">{t("정한 목표는 성과와 리포트에 바로 반영돼요.")}</p>
        </div>
      )}
    </section>
  )
}

// 이 협찬에서 방식 하나가 지금까지 센 것과 그 단위.
function methodCount(method: MeasureMethod, counts: Metrics) {
  const count = counts[methodInfo[method.kind].metric].toLocaleString(locale)
  if (methodInfo[method.kind].bulk) return t("{count}개", { count })
  return ["qr", "coupon", "sns", "survey", "purchase", "raffle"].includes(method.kind)
    ? t("{count}건", { count })
    : t("{count}명", { count })
}

const sameMethods = (a: MeasureMethod[], b: MeasureMethod[]) => JSON.stringify(a) === JSON.stringify(b)

// 행사에서 협찬을 확인하는 방식(협찬 확인 방식). 전자 계약서 바로 아래에 있다.
// 쓰는 방식은 몇 개든 되고, 각 방식을 현장에서 확인하는 쪽(어느 한쪽 또는
// 양쪽)과 각각이 센 것, 그리고 이쪽의 현장 페이지와 PIN이 나온다. 행사가
// 시작하기 전까지 양쪽 누구나 바꿀 수 있으며 바꾸면 양쪽이 다시 확인해야 한다.
// 양쪽이 그 방식을 담은 전자 계약서를 확인한 뒤에야 여기와 성과에서 센다.
function MethodsPanel({
  agreement,
  busy,
  onSave,
}: {
  agreement: Agreement
  busy: boolean
  onSave: (methods: MeasureMethod[]) => Promise<boolean>
}) {
  const { measure, event } = agreement
  const [draft, setDraft] = useState<MeasureMethod[] | null>(null)
  const [error, setError] = useState("")
  if (!measure || !event) return null
  const sideName = (side: MethodSide) =>
    side === "both" ? t("두 쪽 모두") : agreement[side].name
  const venue = measure.venue
  const settled = measure.confirmedMethods !== undefined && sameMethods(measure.confirmedMethods, measure.methods)
  const status = settled
    ? t("확정됐어요. 이 방식으로 성과에 반영돼요")
    : measure.confirmedMethods
      ? t("바뀐 방식은 두 쪽이 다시 확인하면 반영돼요. 그때까지는 먼저 확정한 방식으로 집계해요")
      : t("두 쪽이 계약서를 모두 확인하면 성과에 반영돼요")

  if (draft) {
    const chosen = (kind: MethodKind) => draft.find((method) => method.kind === kind)
    const toggle = (kind: MethodKind) => {
      if (chosen(kind)) {
        // 이 방식에 필요한 것이 함께 따라온다(QR에는 쿠폰, 쿠폰에는 매장 방문).
        const dropped = new Set([kind])
        for (const method of methodKinds) if (methodInfo[method].needs && dropped.has(methodInfo[method].needs!)) dropped.add(method)
        setDraft(draft.filter((method) => !dropped.has(method.kind)))
      } else {
        // 필요한 것도 함께 따라온다.
        const added: MeasureMethod[] = []
        for (let need: MethodKind | undefined = kind; need && !chosen(need); need = methodInfo[need].needs) {
          added.push({ kind: need, side: methodInfo[need].side })
        }
        setDraft(sortedMethods([...draft, ...added]))
      }
    }
    const choose = (kind: MethodKind, side: MethodSide) =>
      setDraft(draft.map((method) => (method.kind === kind ? { ...method, side } : method)))
    return (
      <section className="agreement-section methods-panel">
        <h2>
          {t("협찬 확인 방식")}
          <small>{t("여러 개를 고를 수 있어요. 방식마다 현장에서 확인할 쪽도 골라 주세요")}</small>
        </h2>
        <ul className="method-options">
          {methodKinds.map((kind) => {
            const info = methodInfo[kind]
            const picked = chosen(kind)
            return (
              <li className={picked ? "method-option chosen" : "method-option"} key={kind}>
                <label className="method-use">
                  <input checked={Boolean(picked)} onChange={() => toggle(kind)} type="checkbox" />
                  <Icon name={info.icon} size={16} />
                  <span>
                    <strong>{t(info.label)}</strong>
                    <small>{t(info.detail)}</small>
                  </span>
                </label>
                {picked && (
                  <fieldset className="method-side">
                    <legend>
                      {info.auto
                        ? t("{method} 맡는 쪽", { method: t(info.label) })
                        : t("{method} 확인하는 쪽", { method: t(info.label) })}
                    </legend>
                    {(["group", "brand", "both"] as const).map((side) => (
                      <label key={side}>
                        <input
                          checked={picked.side === side}
                          disabled={info.fixed && side !== info.side}
                          name={`method-side-${kind}`}
                          onChange={() => choose(kind, side)}
                          type="radio"
                        />
                        {sideName(side)}
                      </label>
                    ))}
                  </fieldset>
                )}
              </li>
            )
          })}
        </ul>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="goals-actions">
          <button className="cancel-button" onClick={() => setDraft(null)} type="button">
            {t("취소")}
          </button>
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              if (draft.length === 0) return setError(t("협찬 확인 방식을 하나 이상 골라 주세요."))
              setError("")
              void onSave(draft).then((saved) => saved && setDraft(null))
            }}
            type="button"
          >
            {t("저장")}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="agreement-section methods-panel">
      <h2>
        {t("협찬 확인 방식")}
        <small className={settled ? "settled" : ""}>{status}</small>
      </h2>
      <ul className="method-list">
        {measure.methods.map((method) => {
          const info = methodInfo[method.kind]
          return (
            <li key={method.kind}>
              <Icon name={info.icon} size={16} />
              <span>
                <strong>{t(info.label)}</strong>
                <small>
                  {method.side === "both"
                    ? t("두 쪽 모두 현장에서 확인")
                    : info.auto
                      ? t("{name}에서 운영", { name: sideName(method.side) })
                      : t("{name}에서 현장 확인", { name: sideName(method.side) })}
                </small>
              </span>
              <em>{methodCount(method, measure.counts)}</em>
            </li>
          )
        })}
      </ul>
      {venue && (
        <div className="venue-access">
          <strong>{t("우리 쪽 현장 확인")}</strong>
          <p className="field-hint">
            {venue.page === "staff"
              ? t("행사 날 담당 직원이 자기 기기에서 이 주소를 열고 PIN을 넣으면, 우리 브랜드가 맡은 방식을 기록할 수 있어요.")
              : t("행사 날 담당자가 자기 기기에서 이 주소를 열고 PIN을 넣으면, 우리 단체가 맡은 방식을 기록할 수 있어요.")}
          </p>
          <a className="qr-link" href={venueLink(measure.code, venue.page)} rel="noreferrer" target="_blank">
            {venueLink(measure.code, venue.page)}
          </a>
          {venue.pin ? (
            <span>
              {t("PIN")} <strong>{venue.pin}</strong>
            </span>
          ) : (
            venue.pinsFrom && <small>{t("PIN은 행사 하루 전인 {date}부터 여기에 보여요.", { date: formatFullDate(venue.pinsFrom) })}</small>
          )}
        </div>
      )}
      {!event.started && (
        <div className="goals-actions">
          <Pill onClick={() => setDraft(measure.methods)} variant="outline">
            {t("협찬 확인 방식 고르기")}
          </Pill>
          <p className="field-hint">{t("고치면 두 쪽 모두 계약서를 다시 확인해야 해요.")}</p>
        </div>
      )}
    </section>
  )
}

// 행사가 끝난 뒤 이쪽이 상대에게 쓰는 후기(별점, 목록에서 고른 태그 세 개까지,
// 짧은 코멘트)를 폼이나 쓴 글로 보여 주고, 상대가 남긴 후기도 보여 준다. 상대의
// 후기 아래에 이쪽이 쓰는 답글은 한 번 쓰면 고정되거나 지울 수 있으며, 운영자가
// 내렸으면 안내가 붙는다.
function ReplyEditor({
  review,
  name,
  busy,
  onSave,
  onDelete,
}: {
  review: Review
  // 답글 아래에 보일 이쪽의 이름.
  name: string
  busy: boolean
  onSave: (text: string) => Promise<boolean>
  onDelete: () => void
}) {
  const reply = review.reply
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState("")
  const write = (from: string) => {
    setText(from)
    setWriting(true)
  }

  if (writing) {
    return (
      <form
        className="review-reply-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onSave(text).then((saved) => saved && setWriting(false))
        }}
      >
        <label className="review-comment">
          {t("답글")}
          <textarea maxLength={300} onChange={(event) => setText(event.target.value)} rows={3} value={text} />
        </label>
        <div className="review-form-actions">
          <button className="cancel-button" onClick={() => setWriting(false)} type="button">
            {t("취소")}
          </button>
          <button className="primary-button" disabled={busy || !text.trim()} type="submit">
            {t("답글 저장")}
          </button>
        </div>
      </form>
    )
  }
  if (!reply) {
    return (
      <div className="review-card-actions">
        <button className="cancel-button" onClick={() => write("")} type="button">
          <Icon name="chat" size={14} /> {t("답글 달기")}
        </button>
      </div>
    )
  }
  return (
    <div className="review-reply">
      <span className="review-reply-head">
        <Icon name="chat" size={13} />
        {t("{name}의 답글", { name })} · {formatFullDate(reply.createdAt.slice(0, 10))}
      </span>
      {reply.hidden ? (
        <p className="field-hint">{t("운영자가 이 답글을 내렸어요. 다른 사람에게는 보이지 않아요.")}</p>
      ) : (
        <p>{reply.text}</p>
      )}
      <div className="review-card-actions">
        {!reply.hidden && (
          <button className="cancel-button" onClick={() => write(reply.text ?? "")} type="button">
            {t("고치기")}
          </button>
        )}
        <button className="cancel-button" disabled={busy} onClick={onDelete} type="button">
          {t("지우기")}
        </button>
      </div>
    </div>
  )
}

function ReviewPanel({
  agreement,
  busy,
  onSave,
  onDelete,
  onReply,
  onDeleteReply,
}: {
  agreement: Agreement
  busy: boolean
  onSave: (body: { rating: number; tags: string[]; comment: string }) => Promise<boolean>
  onDelete: () => void
  // 이쪽에 대한 상대의 후기에 답하거나 답을 거둔다.
  onReply: (text: string) => Promise<boolean>
  onDeleteReply: () => void
}) {
  const { review } = agreement
  const partner = agreement.side === "group" ? agreement.brand : agreement.group
  const own = agreement.side === "group" ? agreement.group : agreement.brand
  const choices = reviewTags[agreement.side === "group" ? "브랜드" : "학생단체"]
  const [writing, setWriting] = useState(!review.mine)
  const [rating, setRating] = useState(review.mine?.rating ?? 0)
  const [tags, setTags] = useState<string[]>(review.mine?.tags ?? [])
  const [comment, setComment] = useState(review.mine?.comment ?? "")
  const toggle = (tag: string) =>
    setTags(tags.includes(tag) ? tags.filter((item) => item !== tag) : tags.length < 3 ? [...tags, tag] : tags)

  return (
    <section className="agreement-section review-panel">
      <h2>{t("협찬 후기")}</h2>
      {!review.open ? (
        <p className="field-hint">{t("행사 날부터 서로 후기를 남길 수 있어요. 남긴 후기는 상대의 상세 정보에 보여요.")}</p>
      ) : !review.canWrite ? (
        <p className="field-hint">{t("이 협찬에는 후기를 남길 수 없어요. 데모 계정이거나 상대의 소개가 아직 없어요.")}</p>
      ) : review.mine && !writing ? (
        <ReviewCard
          actions={
            <>
              <button className="cancel-button" onClick={() => setWriting(true)} type="button">
                {t("고치기")}
              </button>
              <button className="cancel-button" disabled={busy} onClick={onDelete} type="button">
                {t("지우기")}
              </button>
            </>
          }
          review={review.mine}
          title={t("내가 남긴 후기")}
        />
      ) : (
        <form
          className="review-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave({ rating, tags, comment }).then((saved) => saved && setWriting(false))
          }}
        >
          <p className="field-hint">
            {t("이번 협찬은 어땠나요? 남긴 후기는 {name}의 상세 정보에 보여요.", { name: partner.name })}
          </p>
          <fieldset className="star-input">
            <legend>{t("별점")}</legend>
            {[1, 2, 3, 4, 5].map((value) => (
              <label className={value <= rating ? "on" : undefined} key={value}>
                <input
                  checked={rating === value}
                  name="rating"
                  onChange={() => setRating(value)}
                  type="radio"
                  value={value}
                />
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d={starPath} />
                </svg>
                <span className="sr-only">{t("{count}점", { count: value })}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="review-tag-input">
            <legend>{t("어떤 점이 좋았나요? (3개까지)")}</legend>
            {choices.map((tag) => (
              <label className={tags.includes(tag) ? "on" : undefined} key={tag}>
                <input
                  checked={tags.includes(tag)}
                  disabled={!tags.includes(tag) && tags.length >= 3}
                  onChange={() => toggle(tag)}
                  type="checkbox"
                />
                {t(tag)}
              </label>
            ))}
          </fieldset>
          <label className="review-comment">
            {t("한 줄 후기")}
            <textarea maxLength={300} onChange={(event) => setComment(event.target.value)} rows={3} value={comment} />
          </label>
          <div className="review-form-actions">
            {review.mine && (
              <button className="cancel-button" onClick={() => setWriting(false)} type="button">
                {t("취소")}
              </button>
            )}
            <button className="primary-button" disabled={busy || rating === 0} type="submit">
              {review.mine ? t("저장") : t("후기 남기기")}
            </button>
          </div>
        </form>
      )}
      {review.theirs && (
        <ReviewCard
          reply={
            review.canReply ? (
              <ReplyEditor busy={busy} name={own.name} onDelete={onDeleteReply} onSave={onReply} review={review.theirs} />
            ) : (
              <ReviewReply name={own.name} review={review.theirs} />
            )
          }
          review={review.theirs}
          title={t("{name}에서 남긴 후기", { name: partner.name })}
        />
      )}
    </section>
  )
}

// 협찬 취소: 한쪽이 이유를 밝혀 요청하면 상대가 동의하거나 거절하고, 요청한
// 쪽은 거둘 수 있다. 취소되면 사라지며, 이쪽이 요청할 수 없는 경우(행사 뒤나
// 데모 계정)에는 요청된 것이 없으면 보이지 않는다.
function CancelPanel({
  agreement,
  busy,
  onAsk,
  onAgree,
  onDrop,
}: {
  agreement: Agreement
  busy: boolean
  onAsk: (reason: string) => Promise<boolean>
  onAgree: () => void
  onDrop: () => void
}) {
  const { cancel } = agreement
  const partner = agreement.side === "group" ? agreement.brand : agreement.group
  const [writing, setWriting] = useState(false)
  const [reason, setReason] = useState("")
  const [agreeing, setAgreeing] = useState(false)
  if (cancel?.canceledAt || (!cancel && !agreement.cancelable)) return null

  return (
    <section aria-labelledby="agreement-cancel-title" className="agreement-section agreement-cancel">
      <h2 id="agreement-cancel-title">{t("협찬 취소")}</h2>
      {cancel ? (
        <>
          <p>
            {cancel.by === agreement.side
              ? t("{name}에 협찬 취소를 요청했어요. 상대가 동의하면 취소돼요.", { name: partner.name })
              : t("{name}에서 협찬 취소를 요청했어요.", { name: partner.name })}
          </p>
          <p className="field-hint">{t("이유: {reason}", { reason: cancel.reason })}</p>
          <div className="agreement-cancel-actions">
            {cancel.by === agreement.side ? (
              <button className="cancel-button" disabled={busy} onClick={onDrop} type="button">
                {t("요청 거두기")}
              </button>
            ) : agreeing ? (
              <>
                <span className="request-confirm">{t("협찬을 취소할까요? 되돌릴 수 없어요.")}</span>
                <button className="cancel-button" onClick={() => setAgreeing(false)} type="button">
                  {t("아니요")}
                </button>
                <button className="decline-button" disabled={busy} onClick={onAgree} type="button">
                  {t("취소에 동의")}
                </button>
              </>
            ) : (
              <>
                <button className="cancel-button" disabled={busy} onClick={onDrop} type="button">
                  {t("거절하기")}
                </button>
                <button className="decline-button" onClick={() => setAgreeing(true)} type="button">
                  {t("취소에 동의")}
                </button>
              </>
            )}
          </div>
        </>
      ) : writing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onAsk(reason.trim()).then((sent) => sent && setWriting(false))
          }}
        >
          <label className="field">
            <span>{t("취소하려는 이유")}</span>
            <textarea
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("예) 기상 악화로 행사가 취소됐어요")}
              rows={3}
              value={reason}
            />
          </label>
          <p className="field-hint">
            {t("상대가 동의하면 협찬이 취소되고 성과와 일정에서도 빠져요. 되돌릴 수 없어요.")}
          </p>
          <div className="agreement-cancel-actions">
            <button className="cancel-button" onClick={() => setWriting(false)} type="button">
              {t("닫기")}
            </button>
            <button className="decline-button" disabled={busy || !reason.trim()} type="submit">
              {t("취소 요청 보내기")}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="field-hint">
            {t("행사가 취소되는 등 협찬을 이어 갈 수 없게 되면, 상대의 동의를 받아 협찬을 취소할 수 있어요.")}
          </p>
          <div className="agreement-cancel-actions">
            <button className="cancel-button" onClick={() => setWriting(true)} type="button">
              {t("협찬 취소 요청")}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

// 협찬의 가치(현금과 현물 환산). 행사가 끝날 때까지 양쪽 누구나 쓸 수 있고,
// 그에 따른 플랫폼 수수료도 보여 준다. 브랜드는 확정할 때 가치의 15%를 내고
// 학생단체는 내지 않는다.
function ValuePanel({
  agreement,
  busy,
  onSave,
}: {
  agreement: Agreement
  busy: boolean
  onSave: (value: { cash: number; inKind: number }) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ cash: "", inKind: "" })
  const value = agreement.value
  const fee = agreement.fee
  const canceled = Boolean(agreement.cancel?.canceledAt)
  const open = () => {
    setDraft({ cash: String(value?.cash ?? ""), inKind: String(value?.inKind ?? "") })
    setEditing(true)
  }
  const won = (input: string) => Number(input.replace(/[^0-9]/g, "") || 0)
  const total = (value?.cash ?? 0) + (value?.inKind ?? 0)
  return (
    <section aria-labelledby="value-title" className="agreement-section value-panel">
      <h2 id="value-title">
        {t("협찬액과 수수료")}
        {!editing && !canceled && (
          <button className="subtle-link" onClick={open} type="button">
            <Icon name="edit" size={14} /> {value ? t("고치기") : t("적기")}
          </button>
        )}
      </h2>
      {editing ? (
        <form
          className="value-form"
          onSubmit={(event) => {
            event.preventDefault()
            void onSave({ cash: won(draft.cash), inKind: won(draft.inKind) }).then((saved) => saved && setEditing(false))
          }}
        >
          <label>
            {t("현금")}
            <input inputMode="numeric" onChange={(event) => setDraft({ ...draft, cash: event.target.value })} placeholder="200000" value={draft.cash} />
          </label>
          <label>
            {t("현물 환산")}
            <input inputMode="numeric" onChange={(event) => setDraft({ ...draft, inKind: event.target.value })} placeholder="100000" value={draft.inKind} />
          </label>
          <p className="field-hint">{t("제품, 쿠폰, 장소처럼 현물로 주는 것은 판매가로 환산해 적어 주세요. 바꾸면 두 쪽 모두 다시 확인해요.")}</p>
          <div className="value-form-actions">
            <button className="cancel-button" onClick={() => setEditing(false)} type="button">
              {t("취소")}
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {t("저장하기")}
            </button>
          </div>
        </form>
      ) : (
        <dl className="value-figures">
          <div>
            <dt>{t("협찬액")}</dt>
            <dd>
              {value ? fullWon(total) : t("아직 적지 않았어요")}
              {value && <small>{t("현금 {cash} · 현물 {inKind}", { cash: fullWon(value.cash), inKind: fullWon(value.inKind) })}</small>}
            </dd>
          </div>
          <div>
            <dt>{t("플랫폼 수수료")}</dt>
            <dd>
              {fee.exempt ? (
                t("없어요")
              ) : agreement.side === "brand" ? (
                <>
                  {value ? fullWon(fee.amount) : t("협찬액의 {rate}%", { rate: Math.round(fee.rate * 100) })}
                  <small>
                    {!value
                      ? t("협찬액을 적으면 정해져요")
                      : fee.due === 0
                        ? t("결제했어요")
                        : fee.paid > 0
                          ? t("{paid} 결제 · {due} 남음", { paid: fullWon(fee.paid), due: fullWon(fee.due) })
                          : t("협찬액의 {rate}% · 부가세 별도", { rate: Math.round(fee.rate * 100) })}
                  </small>
                </>
              ) : (
                <>
                  {t("학생단체는 무료예요")}
                  <small>{t("브랜드가 협찬액의 {rate}%를 플랫폼 수수료로 내요", { rate: Math.round(fee.rate * 100) })}</small>
                </>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  )
}

// 협찬의 계약서(임시 전자 계약서): 양쪽, 행사와 브랜드가 주는 것, 가치와
// 수수료. 시작하기 전에 여기서 정하는 행사 목표. 링크와 사진을 증빙으로
// 체크하는 각 쪽의 항목. 현재 상태의 항목에 대한 각 쪽의 확인. 그리고 인쇄(또는
// 인쇄 창에서 PDF로 저장). 계약 조항: 계약서에 든 내용으로 읽는 계약으로, 번호,
// 양 당사자, 아홉 조항(목적, 협찬 대상, 시기, 각 쪽의 의무, 결과 확인 방법,
// 수수료, 변경과 취소, 연락처, 효력 발생)과 서명으로서의 각 쪽의 확인을 담는다.
// 이 페이지에서 합의한 내용을 말할 뿐 공인 전자서명은 아니다.
function ContractTerms({ agreement }: { agreement: Agreement }) {
  const brand = agreement.brand.name
  const group = agreement.group.name
  const duties = (side: AgreementItem["side"]) => agreement.items.filter((item) => item.side === side).map((item) => item.label)
  const methods = (agreement.measure?.confirmedMethods ?? agreement.measure?.methods ?? []).map((method) => t(methodInfo[method.kind].label))
  const value = agreement.value
  const number = `UC-${agreement.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}`
  const articles: { title: string; body: ReactNode }[] = [
    {
      title: t("목적"),
      body: t("{brand}(이하 ‘협찬사’)는 {group}(이하 ‘단체’)의 ‘{event}’에 협찬하고, 단체는 약속한 홍보와 성과 확인을 이행해요.", {
        brand,
        group,
        event: agreement.eventName,
      }),
    },
    {
      title: t("협찬 내용"),
      body: (
        <>
          {t("협찬 품목: {gives}", { gives: agreement.gives })}
          <br />
          {value
            ? t("협찬액: 현금 {cash} · 현물 환산 {inKind} · 합계 {total}", {
                cash: fullWon(value.cash),
                inKind: fullWon(value.inKind),
                total: fullWon(value.cash + value.inKind),
              })
            : t("협찬액: 아직 적지 않았어요. 위의 협찬액을 적으면 여기에 들어가요.")}
        </>
      ),
    },
    {
      title: t("일정"),
      body: agreement.eventDate ? t("행사일: {date}", { date: formatFullDate(agreement.eventDate) }) : t("행사일은 정해지는 대로 이 계약서에 들어가요."),
    },
    {
      title: t("서로 할 일"),
      body: (
        <>
          <strong>{t("협찬사")}</strong> {duties("brand").join(" · ") || "—"}
          <br />
          <strong>{t("단체")}</strong> {duties("group").join(" · ") || "—"}
          <br />
          {t("각자 끝낸 일은 이 계약서에 표시하고 링크와 사진으로 증빙을 남겨요.")}
        </>
      ),
    },
    {
      title: t("성과 확인"),
      body: methods.length
        ? t("{methods} 방식으로 확인하고 양쪽이 모두 확인한 방식만 성과로 세요.", { methods: methods.join(", ") })
        : t("현장 QR 체크인과 쿠폰, 매장 방문으로 확인해요."),
    },
    {
      title: t("수수료"),
      body: agreement.fee.exempt
        ? t("이 협찬에는 플랫폼 수수료가 없어요. 단체는 어떤 경우에도 수수료를 내지 않아요.")
        : t("협찬사는 협찬액의 {rate}%를 플랫폼 수수료로 내고, 결제하면 이 계약서를 확인한 것으로 봐요. 단체는 수수료를 내지 않아요.", {
            rate: Math.round(agreement.fee.rate * 100),
          }),
    },
    {
      title: t("변경과 취소"),
      body: t("내용을 바꾸면 양쪽이 다시 확인해야 해요. 행사 전에는 한쪽이 이유를 적어 취소를 요청하고 상대가 동의하면 취소되고, 이때 낸 수수료는 돌려드려요."),
    },
    {
      title: t("개인정보"),
      body: t("서로의 담당자 연락처는 이 협찬을 위해서만 쓰고, 다른 곳에 알리지 않아요."),
    },
    {
      title: t("효력"),
      body: t("양쪽이 모두 확인한 때부터 효력이 생기고, 각자의 확인 시각이 서명을 대신해요."),
    },
  ]
  const signer = (side: AgreementItem["side"]) => {
    const party = agreement[side]
    const at = agreement.confirmed[side]
    return (
      <div className={at ? "contract-sign signed" : "contract-sign"}>
        <span>{side === "brand" ? t("협찬사") : t("단체")}</span>
        <strong>{party.name}</strong>
        {party.contact && <small>{t("담당자 {name} · {position}", { name: party.contact.name, position: t(party.contact.position) })}</small>}
        <em>{at ? t("{date} 확인", { date: formatDateTime(at) }) : t("확인 전")}</em>
      </div>
    )
  }
  return (
    <section aria-labelledby="agreement-terms-title" className="agreement-section contract-terms">
      <h2 id="agreement-terms-title">
        {t("계약 조항")}
        <small>
          {t("계약 번호 {number} · 작성 {date}", { number, date: formatFullDate(agreement.createdAt.slice(0, 10)) })}
        </small>
      </h2>
      <ol className="contract-articles">
        {articles.map((article, index) => (
          <li key={article.title}>
            <strong>{t("제{number}조 ({title})", { number: index + 1, title: article.title })}</strong>
            <p>{article.body}</p>
          </li>
        ))}
      </ol>
      <div className="contract-signs">
        {signer("brand")}
        {signer("group")}
      </div>
      <p className="field-hint">{t("임시 전자 계약서는 두 쪽이 합의한 내용을 남기는 기록이에요. 공인 전자서명은 아니에요.")}</p>
    </section>
  )
}

// 협찬 물품 배송: 양쪽이 보낸 택배. 각각 택배사, 번호, 조회 링크가 있고 하나 더
// 적을 행이 있다. 택배를 적은 쪽만 그것을 지울 수 있다.
function ShipmentsPanel({
  agreement,
  busy,
  onAdd,
  onRemove,
}: {
  agreement: Agreement
  busy: boolean
  onAdd: (body: { carrier: string; number: string; note?: string }) => Promise<boolean>
  onRemove: (shipmentId: string) => void
}) {
  const [carrier, setCarrier] = useState<string>(carriers[0])
  const [number, setNumber] = useState("")
  const [note, setNote] = useState("")
  const shipments = agreement.shipments ?? []
  const canceled = Boolean(agreement.cancel?.canceledAt)
  if (canceled && shipments.length === 0) return null
  const sideName = (side: Shipment["side"]) => (side === "group" ? agreement.group.name : agreement.brand.name)
  return (
    <section aria-labelledby="agreement-shipments-title" className="agreement-section agreement-shipments">
      <h2 id="agreement-shipments-title">{t("협찬 물품 배송")}</h2>
      <p className="field-hint">{t("물품을 택배로 보냈다면 운송장 번호를 남겨 주세요. 상대에게 메일로 알리고 여기서 바로 조회할 수 있어요.")}</p>
      {shipments.length > 0 && (
        <ul className="shipment-list">
          {shipments.map((shipment) => (
            <li key={shipment.id}>
              <div>
                <strong>
                  {t(shipment.carrier)} · {shipment.number}
                </strong>
                <small>
                  {t("{name}에서 보냄", { name: sideName(shipment.side) })} · {formatDateTime(shipment.addedAt)}
                  {shipment.note ? ` · ${shipment.note}` : ""}
                </small>
              </div>
              <a className="cancel-button" href={trackingLink(shipment.carrier, shipment.number)} rel="noreferrer" target="_blank">
                {t("배송 조회")}
              </a>
              {shipment.side === agreement.side && !canceled && (
                <button
                  aria-label={t("{number} 배송 지우기", { number: shipment.number })}
                  className="delete-button"
                  disabled={busy}
                  onClick={() => onRemove(shipment.id)}
                  type="button"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!canceled && (
        <form
          className="shipment-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (await onAdd({ carrier, number: number.trim(), ...(note.trim() ? { note: note.trim() } : {}) })) {
              setNumber("")
              setNote("")
            }
          }}
        >
          <label>
            {t("택배사")}
            <select onChange={(event) => setCarrier(event.target.value)} value={carrier}>
              {carriers.map((item) => (
                <option key={item} value={item}>
                  {t(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("운송장 번호")}
            <input inputMode="numeric" maxLength={24} onChange={(event) => setNumber(event.target.value)} value={number} />
          </label>
          <label>
            {t("메모 (선택)")}
            <input maxLength={60} onChange={(event) => setNote(event.target.value)} placeholder={t("예) 음료 3박스")} value={note} />
          </label>
          <button className="primary-button" disabled={busy || !number.trim()} type="submit">
            {t("배송 남기기")}
          </button>
        </form>
      )}
    </section>
  )
}

export function AgreementPage({
  id,
  loggedIn,
  goalsSaved = 0,
  paid = 0,
  onBack,
  onLogin,
  onError,
  onNotice,
  onEditGoals,
}: {
  id: string
  loggedIn: boolean
  // 여기서 저장한 목표의 횟수. 페이지가 다시 읽게 한다.
  goalsSaved?: number
  // 결제 창에서 끝낸 결제의 횟수. 마찬가지로 다시 읽게 한다.
  paid?: number
  onBack: () => void
  onLogin: () => void
  onError: (error: unknown) => void
  onNotice: (message: string) => void
  // 계정 자신의 행사에 대한 목표 폼을 연다.
  onEditGoals?: (eventId: string) => void
}) {
  const [agreement, setAgreement] = useState<Agreement>()
  const [failed, setFailed] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [paying, setPaying] = useState(false)
  // 감사 카드 이미지를 만드는 동안 true.
  const [carding, setCarding] = useState(false)

  useEffect(() => {
    if (!loggedIn) return
    let cancelled = false
    api.agreement(id).then(
      (result) => {
        if (!cancelled) setAgreement(result.agreement)
      },
      (error) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, loggedIn, goalsSaved, paid])

  // 변경 하나를 실행한다. 답은 지금 상태의 계약서다.
  const run = async (change: () => Promise<{ agreement: Agreement }>, done?: string) => {
    setBusy(true)
    try {
      setAgreement((await change()).agreement)
      if (done) onNotice(done)
      return true
    } catch (error) {
      // 브라우저가 읽지 못한 사진은 이유를 자기 말로 알려 준다.
      if (error instanceof ApiError || !(error instanceof Error)) onError(error)
      else onNotice(error.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 이쪽의 후기를 쓰고(null이면 지운다) 지금 상태로 보여 준다.
  const saveReview = async (body: { rating: number; tags: string[]; comment: string } | null) => {
    if (!agreement) return false
    const partner = agreement.side === "group" ? agreement.brand : agreement.group
    setBusy(true)
    try {
      let mine: Review | undefined
      if (body) mine = (await api.saveReview(agreement.id, body)).review
      else await api.deleteReview(agreement.id)
      setAgreement({ ...agreement, review: { ...agreement.review, mine } })
      onNotice(body ? t("후기를 남겼어요. {name}의 상세 정보에 보여요.", { name: partner.name }) : t("후기를 지웠어요."))
      return true
    } catch (error) {
      onError(error)
      return false
    } finally {
      setBusy(false)
    }
  }

  // 상대의 후기에 대한 이쪽의 답. null이면 거둔다.
  const saveReply = async (text: string | null) => {
    const theirs = agreement?.review.theirs
    if (!agreement || !theirs) return false
    setBusy(true)
    try {
      let next: Review
      if (text !== null) next = (await api.replyReview(agreement.id, text)).review
      else {
        await api.deleteReply(agreement.id)
        const { reply: _gone, ...rest } = theirs
        next = rest
      }
      setAgreement({ ...agreement, review: { ...agreement.review, theirs: next } })
      onNotice(text !== null ? t("답글을 남겼어요. 후기 아래에 함께 보여요.") : t("답글을 지웠어요."))
      return true
    } catch (error) {
      onError(error)
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!loggedIn || !agreement) {
    return (
      <section className="page-view agreement-view">
        <PageIntro
          onBack={onBack}
          eyebrow="Agreement"
          title={t("임시 전자 계약서")}
          description={!loggedIn ? undefined : failed || t("계약서를 불러오고 있어요…")}
        />
        {!loggedIn && (
          <div className="day-empty messages-empty">
            <p>{t("로그인하면 확정된 협찬의 계약서를 볼 수 있어요.")}</p>
            <button className="primary-button" onClick={onLogin} type="button">
              {t("로그인")}
            </button>
          </div>
        )}
      </section>
    )
  }

  const side = agreement.side
  const other: ChatSide = side === "group" ? "brand" : "group"
  const state = agreementState(agreement.confirmed, side)
  // 취소됨: 기록으로만 남는다.
  const canceledAt = agreement.cancel?.canceledAt
  const parties = [
    { side: "brand" as const, role: t("브랜드"), ...agreement.brand },
    { side: "group" as const, role: t("학생단체"), ...agreement.group },
  ]
  // 내 쪽 항목을 먼저.
  const sections = side === "group" ? [parties[1], parties[0]] : parties

  return (
    <section className="page-view agreement-view">
      <PageIntro
        onBack={onBack}
        eyebrow="Agreement"
        title={t("{name} 임시 전자 계약서", { name: agreement.eventName })}
        description={`${agreement.group.name} × ${agreement.brand.name}`}
        actions={
          <Pill onClick={() => window.print()} variant="outline">
            {t("인쇄 · PDF 저장")}
          </Pill>
        }
      />

      <article className="agreement-sheet">
        <dl className="agreement-facts">
          {parties.map((party) => (
            <div key={party.side}>
              <dt>{party.role}</dt>
              <dd>
                {party.name}
                {!party.member && <small>{t("아직 uniconnect 계정이 없어요")}</small>}
                {party.contact && (
                  <small className="agreement-contact">
                    {t("담당자 {name} · {position}", { name: party.contact.name, position: t(party.contact.position) })}{" "}
                    <a href={`tel:${party.contact.phone.replace(/-/g, "")}`}>{party.contact.phone}</a>
                  </small>
                )}
              </dd>
            </div>
          ))}
          <div>
            <dt>{t("행사")}</dt>
            <dd>
              {agreement.eventName}
              {agreement.eventDate && <small>{formatFullDate(agreement.eventDate)}</small>}
            </dd>
          </div>
          <div>
            <dt>{t("협찬 내용")}</dt>
            <dd>{agreement.gives}</dd>
          </div>
        </dl>

        {canceledAt ? (
          <div className="agreement-confirm">
            <span className="agreement-state canceled">{t("취소된 협찬")}</span>
            <p className="field-hint">{t("{date}에 협찬을 취소했어요.", { date: formatDateTime(canceledAt) })}</p>
            <p className="field-hint">{t("이유: {reason}", { reason: agreement.cancel!.reason })}</p>
          </div>
        ) : (
        <div className="agreement-confirm">
          <span className={`agreement-state ${state.className}`}>{t(state.label)}</span>
          <ul>
            {parties.map((party) => (
              <li key={party.side}>
                {party.name}{" "}
                {agreement.confirmed[party.side] ? (
                  <strong>{t("{date} 확인", { date: formatDateTime(agreement.confirmed[party.side]!) })}</strong>
                ) : (
                  <em>{t("확인 전")}</em>
                )}
              </li>
            ))}
          </ul>
          {!agreement.confirmed[side] && !editing && side === "brand" && agreement.fee.needsValue ? (
            <p className="field-hint">{t("협찬액을 적으면 수수료를 결제하고 확인할 수 있어요.")}</p>
          ) : !agreement.confirmed[side] && !editing && side === "brand" && agreement.fee.due > 0 ? (
            <Pill disabled={busy} onClick={() => setPaying(true)}>
              {t("수수료 {amount} 결제하고 확인하기", { amount: fullWon(agreement.fee.due) })}
            </Pill>
          ) : (
            !agreement.confirmed[side] &&
            !editing && (
              <Pill
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.confirmAgreement(agreement.id),
                    agreement.confirmed[other]
                      ? t("양쪽 모두 확인했어요.")
                      : t("확인했어요. {name}에 알렸어요.", { name: agreement[other].name }),
                  )
                }
              >
                {t("이 내용으로 확인하기")}
              </Pill>
            )
          )}
        </div>
        )}
      </article>

      <ValuePanel
        agreement={agreement}
        busy={busy}
        onSave={(value) => run(() => api.saveAgreementValue(agreement.id, value), t("협찬액을 적었어요. 두 쪽 모두 다시 확인해 주세요."))}
      />

      <Presence show={paying}>
        <PaymentModal
          amount={agreement.fee.due}
          kind="fee"
          lines={[
            { label: t("협찬"), value: `${agreement.eventName} · ${agreement.group.name}` },
            { label: t("협찬액"), value: fullWon((agreement.value?.cash ?? 0) + (agreement.value?.inKind ?? 0)) },
            { label: t("수수료율"), value: `${Math.round(agreement.fee.rate * 100)}%` },
            ...(agreement.fee.paid > 0 ? [{ label: t("이미 낸 수수료"), value: fullWon(agreement.fee.paid) }] : []),
          ]}
          onClose={() => setPaying(false)}
          onTransferAsked={() => {
            setPaying(false)
            onNotice(t("계좌 입금을 요청했어요. 입금이 확인되면 계약서가 확인돼요."))
          }}
          targetId={agreement.id}
          title={t("플랫폼 수수료 결제")}
        />
      </Presence>

      <MethodsPanel
        agreement={agreement}
        busy={busy}
        onSave={(methods) =>
          run(() => api.saveMeasureMethods(agreement.id, methods), t("협찬 확인 방식을 고쳤어요. 두 쪽 모두 다시 확인해 주세요."))
        }
      />

      <GoalsPanel agreement={agreement} onEdit={onEditGoals} />

      {agreement.side === "group" && agreement.review.open && !agreement.cancel?.canceledAt && (
        <section aria-labelledby="agreement-thanks-title" className="agreement-section agreement-thanks">
          <h2 id="agreement-thanks-title">{t("협찬 감사 카드뉴스")}</h2>
          <p className="field-hint">
            {t("{brand}에 고마움을 전하는 인스타그램용 이미지(1080×1350)를 행사 성과와 함께 만들어요. SNS 홍보 약속의 증빙으로도 올릴 수 있어요.", { brand: agreement.brand.name })}
          </p>
          <Pill arrow="up-right" disabled={carding} onClick={() => setCarding(true)}>
            {carding ? t("이미지 만드는 중…") : t("카드뉴스 이미지 저장")}
          </Pill>
          {carding && (
            <Suspense fallback={null}>
              <ThanksCardExport
                agreement={agreement}
                onDone={(failed) => {
                  setCarding(false)
                  onNotice(failed ? t("이미지를 만들지 못했어요. 다시 시도해 주세요.") : t("카드뉴스 이미지를 저장했어요."))
                }}
              />
            </Suspense>
          )}
        </section>
      )}

      <ShipmentsPanel
        agreement={agreement}
        busy={busy}
        onAdd={(body) => run(() => api.addShipment(agreement.id, body), t("배송을 남겼어요. 상대에게 알렸어요."))}
        onRemove={(shipmentId) => void run(() => api.deleteShipment(agreement.id, shipmentId), t("배송을 지웠어요."))}
      />

      {editing ? (
        <ItemsEditor
          agreement={agreement}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={(items) =>
            void run(() => api.saveAgreementItems(agreement.id, items), t("할 일을 고쳤어요. 두 쪽 모두 다시 확인해 주세요.")).then(
              (saved) => saved && setEditing(false),
            )
          }
        />
      ) : (
        <>
          {sections.map((party) => {
            const items = agreement.items.filter((item) => item.side === party.side)
            return (
              <section className="agreement-section" key={party.side}>
                <h2>
                  {t("{name} 할 일", { name: party.name })}
                  <small>{t("{done}/{total} 완료", { done: items.filter((item) => item.doneAt).length, total: items.length })}</small>
                </h2>
                {items.length === 0 ? (
                  <p className="field-hint">{t("정한 할 일이 없어요.")}</p>
                ) : (
                  <ul className="agreement-items">
                    {items.map((item) => (
                      <ItemRow
                        agreementId={agreement.id}
                        busy={busy}
                        item={item}
                        key={item.id}
                        mine={item.side === side && !canceledAt}
                        onAddPhoto={(file) =>
                          void run(async () => api.addAgreementPhoto(agreement.id, item.id, await photoFromFile(file)), t("사진을 올렸어요."))
                        }
                        onRemovePhoto={(photo) => void run(() => api.removeAgreementPhoto(agreement.id, item.id, photo))}
                        onUpdate={(body) => run(() => api.updateAgreementItem(agreement.id, item.id, body))}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          {!canceledAt && (
            <>
              <div className="agreement-footer">
                <button className="cancel-button" onClick={() => setEditing(true)} type="button">
                  <Icon name="edit" size={14} /> {t("할 일 고치기")}
                </button>
                <p className="field-hint">{t("사진에 다른 사람의 얼굴이 나오면 동의를 받고 올려 주세요.")}</p>
              </div>
              <ReviewPanel
                agreement={agreement}
                busy={busy}
                onDelete={() => void saveReview(null)}
                onSave={(body) => saveReview(body)}
                onReply={(text) => saveReply(text)}
                onDeleteReply={() => void saveReply(null)}
              />
            </>
          )}
          <ContractTerms agreement={agreement} />
          <CancelPanel
            agreement={agreement}
            busy={busy}
            onAsk={(reason) =>
              run(
                () => api.askToCancelAgreement(agreement.id, reason),
                t("협찬 취소를 요청했어요. {name}에 알렸어요.", { name: agreement[other].name }),
              )
            }
            onAgree={() => void run(() => api.agreeToCancelAgreement(agreement.id), t("협찬을 취소했어요."))}
            onDrop={() =>
              void run(
                () => api.dropCancelRequest(agreement.id),
                agreement.cancel?.by === side ? t("취소 요청을 거뒀어요.") : t("취소 요청을 거절했어요. 협찬은 그대로예요."),
              )
            }
          />
        </>
      )}
    </section>
  )
}
