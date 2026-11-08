import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { ShareButton } from "../components/ShareButton"
import { t, tc } from "../i18n"
import { dDayLabel, formatDay, formatFullDate, formatPeriod } from "../lib/date"
import type { BoardPost, Role } from "../types"

// 글 하나(/board/<id>): 글쓴이가 찾는 것, 기한, 글쓴이. 상대편은 자기 행사나
// 캠페인으로 지원하고(제안), 글쓴이는 지원을 보고 받은함에서 답하며 글을
// 고치거나 마감하거나 지운다.
export function PostPage({
  id,
  role,
  visitor,
  reload,
  onBack,
  onApply,
  onEdit,
  onDeleted,
  onOpenProfile,
  onOpenEvent,
  onOpenInbox,
  onNotice,
}: {
  id: string
  role: Role
  visitor: boolean
  // 글을 고치거나 지원하면 올라가서 다시 불러온다.
  reload: number
  onBack: () => void
  onApply: (post: BoardPost) => void
  onEdit: (post: BoardPost) => void
  onDeleted: () => void
  // 상대편에게 보이는 글쓴이의 프로필.
  onOpenProfile: (listingId: string) => void
  onOpenEvent: (eventId: string) => void
  // 지원에 답하는 곳.
  onOpenInbox: () => void
  onNotice: (message: string) => void
}) {
  const [post, setPost] = useState<BoardPost | null>(null)
  const [failed, setFailed] = useState("")
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.boardPost(id, visitor ? role : undefined).then(
      (result) => {
        if (!cancelled) setPost(result.post)
      },
      (error: unknown) => {
        if (!cancelled) setFailed(errorMessage(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, role, visitor, reload])

  const run = async (change: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await change()
    } catch (error) {
      onNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (!post) {
    return (
      <section className="page-view post-page">
        <PageIntro
          onBack={onBack}
          eyebrow={tc("eyebrow", "모집 게시판")}
          title={t("모집 글")}
          description={failed || t("모집 글을 불러오고 있어요…")}
        />
      </section>
    )
  }

  const applications = post.applications ?? []
  return (
    <section className="page-view post-page">
      <PageIntro
        onBack={onBack}
        eyebrow={post.role === "학생단체" ? tc("eyebrow", "협찬을 찾아요") : tc("eyebrow", "행사를 찾아요")}
        title={post.title}
        description={
          post.open
            ? t("{name} · {date}까지 지원", { name: post.poster.name, date: formatDay(post.deadline) })
            : t("{name} · 마감된 글", { name: post.poster.name })
        }
        actions={<ShareButton text={post.poster.name} title={post.title} />}
      />

      <div className="post-body">
        <div className="post-main">
          <p className="post-text">{post.body}</p>
          <dl className="post-facts">
            <div>
              <dt>{post.role === "학생단체" ? t("원하는 협찬") : t("제공하는 협찬")}</dt>
              <dd className="post-types">
                {post.types.map((type) => (
                  <span key={type}>{t(type)}</span>
                ))}
              </dd>
            </div>
            {post.event && (
              <div>
                <dt>{t("행사")}</dt>
                <dd>
                  <button className="text-link" onClick={() => onOpenEvent(post.event!.id)} type="button">
                    {post.event.name}
                  </button>{" "}
                  · {formatPeriod(post.event.date, post.event.endDate)}
                </dd>
              </div>
            )}
            <div>
              <dt>{t("마감일")}</dt>
              <dd>
                {formatFullDate(post.deadline)} {post.open && <em className="post-dday">{dDayLabel(post.deadline)}</em>}
              </dd>
            </div>
          </dl>

          {post.own && (
            <section aria-labelledby="post-applications-title" className="post-applications">
              <h2 id="post-applications-title">{t("지원한 곳 {count}", { count: applications.length })}</h2>
              {applications.length === 0 ? (
                <p className="field-hint">{t("아직 지원한 곳이 없어요. 지원이 오면 메일과 받은 제안으로도 알려 드려요.")}</p>
              ) : (
                <ul>
                  {applications.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name}</strong>
                      <span>
                        {item.about}
                        {item.date && ` · ${formatDay(item.date)}`}
                      </span>
                      <em className="post-badge">{t(item.status)}</em>
                    </li>
                  ))}
                </ul>
              )}
              <div className="post-actions">
                {applications.length > 0 && (
                  <button className="primary-button" onClick={onOpenInbox} type="button">
                    {post.role === "학생단체" ? t("받은 협찬에서 답하기") : t("받은 제안에서 답하기")}
                  </button>
                )}
                <button className="cancel-button" onClick={() => onEdit(post)} type="button">
                  <Icon name="edit" size={15} /> {t("고치기")}
                </button>
                {post.open && (
                  <button
                    className="cancel-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setPost((await api.closePost(post.id)).post)
                        onNotice(t("모집을 마감했어요. 받은 지원은 그대로 남아요."))
                      })
                    }
                    type="button"
                  >
                    {t("마감하기")}
                  </button>
                )}
                {deleting ? (
                  <button
                    className="decline-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api.deletePost(post.id)
                        onNotice(t("모집 글을 지웠어요."))
                        onDeleted()
                      })
                    }
                    type="button"
                  >
                    {t("정말 지우기")}
                  </button>
                ) : (
                  <button className="cancel-button" onClick={() => setDeleting(true)} type="button">
                    {t("지우기")}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="event-group post-poster">
          <BrandMark match={post.poster} large />
          <strong>{post.poster.name}</strong>
          <span>{[post.poster.school, t(post.poster.category)].filter(Boolean).join(" · ")}</span>
          {!post.own && (
            <>
              {post.applied ? (
                <p className="post-applied">{t("지원했어요 · {status}", { status: t(post.applied) })}</p>
              ) : post.open ? (
                <Pill onClick={() => onApply(post)}>{t("지원하기")}</Pill>
              ) : null}
              <button className="cancel-button" onClick={() => onOpenProfile(post.listingId)} type="button">
                {post.role === "학생단체" ? t("단체 프로필 보기") : t("브랜드 프로필 보기")}
              </button>
              <p className="field-hint">
                {role === "학생단체"
                  ? t("지원하면 고른 행사로 이 브랜드에 협찬 제안이 가요.")
                  : t("지원하면 고른 캠페인으로 이 단체에 협찬 제안이 가요.")}
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  )
}
