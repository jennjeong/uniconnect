import { useEffect, useState } from "react"

import { api, ApiError, errorMessage } from "../api"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { ReviewCard, ReviewReply } from "../components/ReviewCard"
import { starPath } from "../components/Stars"
import { methodInfo, methodKinds, sortedMethods } from "../data/methods"
import { reviewTags } from "../data/reviews"
import { locale, t } from "../i18n"
import { venueLink } from "../lib/checkin"
import { formatDateTime, formatFullDate } from "../lib/date"
import { photoFromFile } from "../lib/image"
import type { Agreement, AgreementItem, ChatSide, MeasureMethod, MethodKind, MethodSide, Metrics, Review } from "../types"
import { agreementState } from "./AgreementsPage"

// A proof photo, fetched with the login token (an <img> can't send it) and
// shown from an object URL; pressing it opens it full size.
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

// One item: done or not (its own side presses it), then its links and
// photos, which its own side adds and removes.
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
  // The box ticks at once and goes back if saving fails.
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

// The items being written: each side's list, an item's words, adding and
// removing. Saving asks both sides to confirm again.
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

// The event's goals (행사 목표): the side whose event it is sets them here,
// through the app's goals form, until the event begins; the other side
// reads them. Measurement then counts toward them.
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

// What one method has counted for this sponsorship so far, with its unit.
function methodCount(method: MeasureMethod, counts: Metrics) {
  const count = counts[methodInfo[method.kind].metric].toLocaleString(locale)
  if (methodInfo[method.kind].bulk) return t("{count}개", { count })
  return ["qr", "coupon", "sns", "survey", "purchase", "raffle"].includes(method.kind)
    ? t("{count}건", { count })
    : t("{count}명", { count })
}

const sameMethods = (a: MeasureMethod[], b: MeasureMethod[]) => JSON.stringify(a) === JSON.stringify(b)

// How the sponsorship is confirmed at the event (협찬 확인 방식), right under
// the e-contract: the methods it uses, any number of them, the side that
// confirms each at the venue (either, or both) and what each has counted,
// then this side's own venue page and PIN. Either side changes them until
// the event begins, which asks both to confirm again; they count, here and
// in 성과, once both sides have confirmed the e-contract with them.
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
        // What needs this method goes with it (the coupon with the QR, store
        // visits with the coupon).
        const dropped = new Set([kind])
        for (const method of methodKinds) if (methodInfo[method].needs && dropped.has(methodInfo[method].needs!)) dropped.add(method)
        setDraft(draft.filter((method) => !dropped.has(method.kind)))
      } else {
        // And what it needs comes with it.
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
          <span>
            {t("PIN")} <strong>{venue.pin}</strong>
          </span>
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

// After the event, this side's review of the other (stars, up to three of
// the listed tags, a short comment) as a form or as written, and the review
// the other side left.
// The reply this side writes under the other side's review of it: written
// once, then fixed or deleted, with a note once the operators took it down.
function ReplyEditor({
  review,
  name,
  busy,
  onSave,
  onDelete,
}: {
  review: Review
  // This side's name, which the reply shows under.
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
  // Answers the other side's review of this side, or takes the answer back.
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

// Calling the sponsorship off: one side asks, saying why, and the other
// agrees or declines; the side that asked can take it back. Gone once it
// is called off, and while this side may not ask (after the event, or from
// a demo account) with nothing asked.
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
            {t("상대가 동의하면 협찬이 취소되고, 성과와 일정에서도 빠져요. 되돌릴 수 없어요.")}
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

// A sponsorship's agreement (임시 전자 계약서): the two sides, the event and what
// the brand gives; the event's goals, set here before it begins; each
// side's items to tick off with links and photos as proof; each side's
// confirmation of the items as they stand; and printing it (or saving it
// as a PDF from the print dialog).
export function AgreementPage({
  id,
  loggedIn,
  goalsSaved = 0,
  onBack,
  onLogin,
  onError,
  onNotice,
  onEditGoals,
}: {
  id: string
  loggedIn: boolean
  // Counts the goals saved from here, so the page reads them again.
  goalsSaved?: number
  onBack: () => void
  onLogin: () => void
  onError: (error: unknown) => void
  onNotice: (message: string) => void
  // Opens the goals form for one of the account's own events.
  onEditGoals?: (eventId: string) => void
}) {
  const [agreement, setAgreement] = useState<Agreement>()
  const [failed, setFailed] = useState("")
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

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
  }, [id, loggedIn, goalsSaved])

  // Runs one change; the answer is the agreement as it now stands.
  const run = async (change: () => Promise<{ agreement: Agreement }>, done?: string) => {
    setBusy(true)
    try {
      setAgreement((await change()).agreement)
      if (done) onNotice(done)
      return true
    } catch (error) {
      // A photo the browser couldn't read says why in its own words.
      if (error instanceof ApiError || !(error instanceof Error)) onError(error)
      else onNotice(error.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // Writes this side's review (null deletes it) and shows it as it now stands.
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

  // This side's answer to the other's review of it; null takes it back.
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
  // Called off: kept only as a record.
  const canceledAt = agreement.cancel?.canceledAt
  const parties = [
    { side: "brand" as const, role: t("브랜드"), ...agreement.brand },
    { side: "group" as const, role: t("학생단체"), ...agreement.group },
  ]
  // My side's items first.
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
          {!agreement.confirmed[side] && !editing && (
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
          )}
        </div>
        )}
      </article>

      <MethodsPanel
        agreement={agreement}
        busy={busy}
        onSave={(methods) =>
          run(() => api.saveMeasureMethods(agreement.id, methods), t("협찬 확인 방식을 고쳤어요. 두 쪽 모두 다시 확인해 주세요."))
        }
      />

      <GoalsPanel agreement={agreement} onEdit={onEditGoals} />

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
