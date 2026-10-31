import { lazy, Suspense, useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { DateLine } from "../components/DateLine"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { ShareButton } from "../components/ShareButton"
import { t } from "../i18n"
import { formatPeriod } from "../lib/date"
import { photoFromFile } from "../lib/image"
import type { EventPage } from "../types"

const ProposalExport = lazy(() => import("../report/ProposalExport").then((module) => ({ default: module.ProposalExport })))

// As many photos as the server keeps on an event page (routes/events.ts).
const maxPhotos = 4

// One photo of the event, fetched with the login token (an <img> can't send
// it) and shown from an object URL; the group can take it down.
function EventPhoto({
  eventId,
  photo,
  alt,
  onRemove,
}: {
  eventId: string
  photo: string
  alt: string
  onRemove?: () => void
}) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let objectUrl: string | undefined
    let cancelled = false
    api.eventPhoto(eventId, photo).then(
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
  }, [eventId, photo])
  return (
    <li className="event-photo">
      {url ? (
        <a href={url} rel="noreferrer" target="_blank">
          <img alt={alt} src={url} />
        </a>
      ) : (
        <span aria-hidden="true" className="event-photo-wait" />
      )}
      {onRemove && (
        <button aria-label={t("이 사진 지우기")} className="event-photo-remove" onClick={onRemove} type="button">
          <Icon name="close" size={14} />
        </button>
      )}
    </li>
  )
}

// A student group's event as its page shows it (/event/<id>): when and
// where, what it is, its photos and the sponsorship packages it offers, and
// the group behind it. The group adds and takes down photos here, and edits
// the rest on the registration form.
export function EventDetailPage({
  id,
  onBack,
  onEdit,
  onCopy,
  onOpenGroup,
  onNotice,
}: {
  id: string
  onBack: () => void
  onEdit: (eventId: string) => void
  // Opens the registration form filled from this event (행사 복제).
  onCopy: (eventId: string) => void
  // The group's profile, for a brand looking (the group catalog is theirs).
  onOpenGroup?: (listingId: string) => void
  onNotice: (message: string) => void
}) {
  const [data, setData] = useState<EventPage | null>(null)
  const [failed, setFailed] = useState("")
  const [busy, setBusy] = useState(false)
  // True while the proposal PDF is being made.
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let cancelled = false
    setData(null)
    setFailed("")
    api.eventPage(id).then(
      (result) => {
        if (!cancelled) setData(result)
      },
      (error: unknown) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const change = async (run: () => Promise<{ event: EventPage["event"] }>, notice: string) => {
    if (busy || !data) return
    setBusy(true)
    try {
      const { event } = await run()
      setData({ ...data, event })
      onNotice(notice)
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!data) {
    return (
      <section className="page-view event-page">
        <PageIntro
          onBack={onBack}
          eyebrow="Event"
          title={t("행사 상세")}
          description={failed || t("행사를 불러오고 있어요…")}
        />
      </section>
    )
  }

  const { event, group, own } = data
  const photos = event.photos ?? []
  const packages = event.packages ?? []
  return (
    <section className="page-view event-page">
      <PageIntro
        onBack={onBack}
        eyebrow="Event"
        title={event.name}
        description={`${group.name} · ${formatPeriod(event.date, event.endDate)}`}
        actions={
          <>
            {own && (
              <button className="primary-button" disabled={exporting} onClick={() => setExporting(true)} type="button">
                <Icon name="download" size={15} /> {exporting ? t("PDF 만드는 중…") : t("제안서 PDF")}
              </button>
            )}
            {own && (
              <button className="cancel-button" onClick={() => onEdit(event.id)} type="button">
                <Icon name="edit" size={15} /> {t("행사 수정")}
              </button>
            )}
            {own && (
              <button className="cancel-button" onClick={() => onCopy(event.id)} type="button">
                <Icon name="copy" size={15} /> {t("복제해서 새로 등록")}
              </button>
            )}
            <ShareButton text={`${group.name} · ${formatPeriod(event.date, event.endDate)}`} title={event.name} />
          </>
        }
      />
      {exporting && (
        <Suspense fallback={null}>
          <ProposalExport
            onDone={(failed) => {
              setExporting(false)
              onNotice(failed ? t("제안서를 만들지 못했어요. 다시 시도해 주세요.") : t("제안서를 PDF로 저장했어요."))
            }}
            page={data}
          />
        </Suspense>
      )}

      <ul className="event-facts">
        <li>
          <Icon name="calendar" size={16} />
          <DateLine date={event.date} />
        </li>
        {event.startTime && (
          <li>
            <Icon name="calendar" size={16} />
            <span className="sr-only">{t("시간")}</span>
            {event.endTime ? `${event.startTime} ~ ${event.endTime}` : t("{time} 시작", { time: event.startTime })}
          </li>
        )}
        {event.venue && (
          <li>
            <Icon name="pin" size={16} />
            <span className="sr-only">{t("장소")}</span>
            {event.venue}
          </li>
        )}
        {event.people && (
          <li>
            <Icon name="users" size={16} />
            {t("예상 {count}명", { count: event.people.replace(/명$/, "") })}
          </li>
        )}
        <li className="event-types">
          {event.kind && <span className="event-kind">{t(event.kind)}</span>}
          {event.types.map((type) => (
            <span key={type}>{type === "기타" && event.typeNote ? event.typeNote : t(type)}</span>
          ))}
        </li>
      </ul>

      <div className="event-body">
        <div className="event-main">
          <section aria-labelledby="event-intro-title" className="event-section">
            <h2 id="event-intro-title">{t("행사 소개")}</h2>
            {event.intro ? (
              <p className="event-intro">{event.intro}</p>
            ) : (
              <p className="field-hint">
                {own ? t("행사 수정에서 소개를 쓰면 브랜드가 행사를 더 잘 알 수 있어요.") : t("아직 소개가 없어요.")}
              </p>
            )}
          </section>

          {event.makeup && (
            <section aria-labelledby="event-makeup-title" className="event-section">
              <h2 id="event-makeup-title">{t("참가자 구성")}</h2>
              <dl className="event-makeup">
                {event.makeup.female !== undefined && (
                  <div>
                    <dt>{t("성별 비율")}</dt>
                    <dd>
                      <span className="makeup-bar" aria-hidden="true">
                        <i style={{ width: `${event.makeup.female}%` }} />
                      </span>
                      {t("여성 {female}% · 남성 {male}%", { female: event.makeup.female, male: 100 - event.makeup.female })}
                    </dd>
                  </div>
                )}
                {event.makeup.years && event.makeup.years.length > 0 && (
                  <div>
                    <dt>{t("오는 사람")}</dt>
                    <dd>{event.makeup.years.map((year) => t(year)).join(", ")}</dd>
                  </div>
                )}
                {event.makeup.majors && (
                  <div>
                    <dt>{t("주요 전공")}</dt>
                    <dd>{event.makeup.majors}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {(photos.length > 0 || own) && (
            <section aria-labelledby="event-photos-title" className="event-section">
              <h2 id="event-photos-title">{t("행사 사진")}</h2>
              {photos.length > 0 && (
                <ul className="event-photos">
                  {photos.map((photo) => (
                    <EventPhoto
                      alt={t("{name} 사진", { name: event.name })}
                      eventId={event.id}
                      key={photo}
                      onRemove={
                        own
                          ? () => void change(() => api.deleteEventPhoto(event.id, photo), t("사진을 지웠어요."))
                          : undefined
                      }
                      photo={photo}
                    />
                  ))}
                </ul>
              )}
              {own && photos.length < maxPhotos && (
                <label className="cancel-button event-photo-add">
                  <Icon name="plus" size={15} /> {t("사진 올리기")}
                  <input
                    accept="image/*"
                    className="sr-only"
                    disabled={busy}
                    onChange={(changed) => {
                      const file = changed.target.files?.[0]
                      changed.target.value = ""
                      if (!file) return
                      void change(async () => api.addEventPhoto(event.id, await photoFromFile(file)), t("사진을 올렸어요."))
                    }}
                    type="file"
                  />
                </label>
              )}
              {own && (
                <p className="field-hint">{t("사진은 {count}장까지 올릴 수 있어요. 다른 사람의 얼굴이 나오면 동의를 받고 올려 주세요.", { count: maxPhotos })}</p>
              )}
            </section>
          )}

          <section aria-labelledby="event-packages-title" className="event-section">
            <h2 id="event-packages-title">{t("협찬 혜택 묶음")}</h2>
            {packages.length > 0 ? (
              <ul className="event-packages">
                {packages.map((item) => (
                  <li key={item.name}>
                    <strong>{item.name}</strong>
                    <p>{item.gives}</p>
                    {item.asks && (
                      <small>
                        {t("원하는 협찬")} · {item.asks}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="field-hint">
                {own
                  ? t("행사 수정에서 브랜드가 받는 것과 원하는 협찬을 묶어 두면 제안을 받기 쉬워요.")
                  : t("아직 정해 둔 혜택 묶음이 없어요. 원하는 협찬은 단체와 이야기해 보세요.")}
              </p>
            )}
          </section>
        </div>

        <aside className="event-group">
          <BrandMark match={group} large />
          <strong>{group.name}</strong>
          <span>{[group.school, t(group.category)].filter(Boolean).join(" · ")}</span>
          {onOpenGroup && !own && (
            <button className="primary-button" onClick={() => onOpenGroup(group.id)} type="button">
              {t("단체 프로필 보기")}
            </button>
          )}
        </aside>
      </div>
    </section>
  )
}
