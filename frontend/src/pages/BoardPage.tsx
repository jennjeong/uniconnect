import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { BrandMark } from "../components/BrandMark"
import { CatalogEmpty } from "../components/CatalogEmpty"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { TabBar } from "../components/TabBar"
import { t } from "../i18n"
import { dDayLabel, formatDay, formatPeriod } from "../lib/date"
import type { BoardPost, Role } from "../types"

// One post on the board: who posted it, its title, a group's event, the kinds
// of sponsorship, and its deadline (or that it closed), with the viewer's
// application when there is one.
export function PostCard({ post, onOpen }: { post: BoardPost; onOpen: () => void }) {
  return (
    <article className={post.open ? "post-card" : "post-card closed"}>
      <div className="post-card-head">
        <BrandMark match={post.poster} />
        <span>
          <strong>{post.poster.name}</strong>
          <small>{[post.poster.school, t(post.poster.category)].filter(Boolean).join(" · ")}</small>
        </span>
      </div>
      <h3>
        <button onClick={onOpen} type="button">
          {post.title}
        </button>
      </h3>
      {post.event && (
        <p className="post-card-event">
          {post.event.name} · {formatPeriod(post.event.date, post.event.endDate)}
        </p>
      )}
      <div className="post-card-foot">
        <span className="post-types">
          {post.types.map((type) => (
            <span key={type}>{t(type)}</span>
          ))}
        </span>
        {post.applied ? (
          <span className="post-badge">{t("지원함 · {status}", { status: t(post.applied) })}</span>
        ) : post.open ? (
          <span className="post-deadline">
            {t("{date}까지", { date: formatDay(post.deadline) })} <em>{dDayLabel(post.deadline)}</em>
          </span>
        ) : (
          <span className="post-badge">{t("마감")}</span>
        )}
      </div>
    </article>
  )
}

type Tab = "posts" | "mine"

// The recruitment board (/board): the other side's open posts, the soonest
// deadline first, and the account's own. Brands post what events they look
// for, student groups what sponsors their events need; applying sends a
// proposal (PostPage). Visitors read the examples of the side they preview.
export function BoardPage({
  role,
  visitor,
  reload,
  onOpen,
  onWrite,
}: {
  role: Role
  visitor: boolean
  // Moves on when a post was written, so the lists load again.
  reload: number
  onOpen: (id: string) => void
  onWrite: () => void
}) {
  const students = role === "학생단체"
  const [data, setData] = useState<{ posts: BoardPost[]; mine: BoardPost[] } | null>(null)
  const [failed, setFailed] = useState("")
  const [tab, setTab] = useState<Tab>("posts")

  useEffect(() => {
    let cancelled = false
    api.board(visitor ? role : undefined).then(
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
  }, [role, visitor, reload])

  const list = tab === "posts" ? data?.posts : data?.mine
  return (
    <section className="page-view board-page">
      <PageIntro
        eyebrow="Recruit Board"
        title={t("모집 게시판")}
        description={
          students
            ? t("브랜드가 찾는 행사에 지원하고, 우리 행사 협찬사도 모집해요.")
            : t("학생단체 모집에 지원하고, 캠페인과 함께할 행사도 모아요.")
        }
        actions={<Pill onClick={onWrite}>{t("모집 글 쓰기")}</Pill>}
      />
      <div className="match-filters">
        <TabBar
          items={[
            { value: "posts", label: students ? t("브랜드 모집 글") : t("학생단체 모집 글") },
            { value: "mine", label: t("내 글") },
          ]}
          label={t("모집 글 보기")}
          onChange={(next: Tab) => setTab(next)}
          value={tab}
        />
      </div>
      {!data ? (
        <p className="day-empty">{failed || t("모집 글을 불러오고 있어요…")}</p>
      ) : list && list.length > 0 ? (
        <ul className="post-grid stagger">
          {list.map((post, index) => (
            <li key={post.id} style={{ "--i": index } as CSSProperties}>
              <PostCard onOpen={() => onOpen(post.id)} post={post} />
            </li>
          ))}
        </ul>
      ) : tab === "posts" ? (
        <CatalogEmpty
          title={t("열려 있는 모집 글이 없어요")}
          text={
            students
              ? t("브랜드가 함께할 행사를 모집하면 여기에 보여요. 그 전에 우리 행사의 협찬사를 먼저 모집해 보세요.")
              : t("학생단체가 협찬사를 모집하면 여기에 보여요. 그 전에 캠페인과 함께할 행사를 먼저 모집해 보세요.")
          }
          action={{ label: t("모집 글 쓰기"), onClick: onWrite }}
        />
      ) : (
        <CatalogEmpty
          title={visitor ? t("로그인하면 모집 글을 쓸 수 있어요") : t("아직 쓴 모집 글이 없어요")}
          text={
            students
              ? t("행사 하나를 골라 원하는 협찬과 마감일을 적으면 브랜드가 지원해요.")
              : t("함께하고 싶은 행사와 줄 수 있는 협찬, 마감일을 적으면 학생단체가 지원해요.")
          }
          action={{ label: t("모집 글 쓰기"), onClick: onWrite }}
        />
      )}
    </section>
  )
}
