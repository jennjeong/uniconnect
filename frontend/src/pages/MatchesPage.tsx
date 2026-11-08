import { useState, type CSSProperties } from "react"

import { CatalogEmpty } from "../components/CatalogEmpty"
import { CatalogSkeleton } from "../components/CatalogSkeleton"
import { type ActiveCondition, CatalogControls } from "../components/CatalogControls"
import { CatalogMap, type Layout } from "../components/CatalogMap"
import { CompareTray, useCompare } from "../components/CompareTray"
import { DemoPreview } from "../components/DemoPreview"
import { NearbyPlaces } from "../components/NearbyPlaces"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { WorkCard } from "../components/WorkCard"
import { brandIndustries } from "../data/industries"
import { useEntryState } from "../hooks/useEntryState"
import { t, tc } from "../i18n"
import { nearestFirst, shownTags } from "../lib/distance"
import { matchesQuery } from "../lib/search"
import type { Industry, Match, NearbyPlace, RequestStatus } from "../types"

// 범위: 무엇을 보는지. 정렬과 업종은 범위와 따로 고른다(components/CatalogControls.tsx).
// '학교 앞 가게'는 정렬이 아니라 다른 목록(카카오의 실제 가게)이라 범위다.
type Scope = "전체" | "추천" | "찜" | "학교 앞 가게"
type Sort = "score" | "popular" | "near"

const scopes: Scope[] = ["전체", "추천", "찜", "학교 앞 가게"]

const sortLabels: Record<Sort, string> = {
  score: "추천 지수순",
  popular: "인기순",
  near: "가까운 순",
}

// 학생단체가 제안할 브랜드. 탭별.
export function MatchesPage({
  matches,
  brands,
  loaded,
  proposals,
  statuses,
  undelivered = [],
  saved,
  onToggleSave,
  onOpenDetail,
  onPropose,
  onCancelProposal,
  onInvite,
  visitor,
  onLogin,
  onSignup,
}: {
  // 단체의 행사에 대한 추천 상위.
  matches: Match[]
  // 카탈로그의 모든 브랜드. 회원에게는 가입한 브랜드만.
  brands: Match[]
  // 카탈로그가 도착했으므로 비어 있으면 정말 비어 있다.
  loaded: boolean
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  // 받은편지함이 없는(가입하지 않은) 상대에게 보낸 제안. 카드는 "전달 대기"로 보인다.
  undelivered?: string[]
  // 계정이 저장한 브랜드(찜)를 최신순으로, 그리고 각 카드의 하트.
  saved: string[]
  onToggleSave: (match: Match) => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // 가까운 순에서 가게를 초대한다(초대가 만들어지면 true).
  onInvite: (place: NearbyPlace) => Promise<boolean>
  // 로그아웃 상태: 가까운 순은 데모 단체의 캠퍼스 둘레에 꾸며 낸 가게를 예시로
  // 표시해 보여 준다.
  visitor: boolean
  onLogin: () => void
  onSignup: () => void
}) {
  const [scope, setScope] = useEntryState<Scope>("matches:scope", "전체")
  const [sort, setSort] = useEntryState<Sort>("matches:sort", "score")
  // 업종 필터. 비워 두면 모든 업종.
  const [industry, setIndustry] = useEntryState<Industry | "">("matches:industryFilter", "")
  // 비교: 카드를 나란히 놓는다(components/CompareTray.tsx).
  const compare = useCompare()
  // 카드는 고른 범위가 있는 쪽에서 미끄러져 들어온다.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickScope = (next: Scope) => {
    setDirection(scopes.indexOf(next) >= scopes.indexOf(scope) ? "forward" : "back")
    setScope(next)
  }
  const industries = brandIndustries.filter(([value]) => brands.some((brand) => brand.industry === value))
  const industryLabel = industries.find(([value]) => value === industry)?.[1]
  // 찾을 단어. 범위를 바꿔도 유지한다.
  const [query, setQuery] = useEntryState("matches:query", "")
  // 카드를 목록으로, 또는 캠퍼스 둘레 지도의 점으로 보여 준다.
  const [layout, setLayout] = useEntryState<Layout>("matches:layout", "list")
  const nearby = scope === "학교 앞 가게"

  const base =
    scope === "추천" ? matches : scope === "찜" ? saved.flatMap((id) => brands.filter((brand) => brand.id === id)) : brands
  const filtered = base.filter((match) => matchesQuery(match, query) && (!industry || match.industry === industry))
  const shown =
    sort === "popular"
      ? [...filtered].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      : sort === "near"
        ? nearestFirst(filtered)
        : [...filtered].sort((a, b) => b.score - a.score)
  // 가입한 브랜드가 아직 없으면 추천은 찾았다고 말할 수 없다.
  const waiting = loaded && brands.length === 0 && scope === "추천"
  const listKey = `${scope}-${sort}-${industry}`

  const active: ActiveCondition[] = nearby
    ? []
    : [
        ...(query.trim() ? [{ key: "query", label: t("‘{query}’ 검색", { query: query.trim() }), onClear: () => setQuery("") }] : []),
        ...(industryLabel ? [{ key: "industry", label: t("업종: {name}", { name: t(industryLabel) }), onClear: () => setIndustry("") }] : []),
        ...(sort !== "score" ? [{ key: "sort", label: t(sortLabels[sort]), onClear: () => setSort("score") }] : []),
      ]
  const clearAll = () => {
    setQuery("")
    setIndustry("")
    setSort("score")
  }

  // 목록과 지도가 보여 주는 브랜드의 카드(인기의 `rank`).
  const card = (match: Match, rank?: number) => (
    <WorkCard
      match={match}
      meta={t(match.category)}
      rank={rank}
      onOpenDetail={() => onOpenDetail(match)}
      saved={saved.includes(match.id)}
      onToggleSave={() => onToggleSave(match)}
      compared={compare.has(match.id)}
      onToggleCompare={() => compare.toggle(match.id)}
      tags={
        <>
          {rank !== undefined && match.popularity !== undefined && (
            <span className="tag-hot">{t("협찬 {count}회", { count: match.popularity })}</span>
          )}
          {shownTags(match).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </>
      }
    >
      <button className="cancel-button" onClick={() => onOpenDetail(match)} type="button">
        {t("상세 정보")}
      </button>
      <ProposalControl
        done={proposals.includes(match.id)}
        status={statuses[match.id]}
        undelivered={undelivered.includes(match.id)}
        label={t("제안하기")}
        className="primary-button"
        onPropose={() => onPropose(match)}
        onCancel={() => onCancelProposal(match)}
      />
    </WorkCard>
  )

  return (
    <section className="page-view">
      <PageIntro
        compact
        eyebrow={tc("eyebrow", "추천 매칭")}
        title={waiting ? t("브랜드가 가입하면 여기에 추천해 드려요") : t("브랜드 찾기")}
        description={
          waiting
            ? t("우리 단체 소개와 잘 맞는 브랜드부터 보여 드려요.")
            : nearby
              ? t("학교 앞 실제 가게를 가까운 순으로 보여요. 아직 없는 곳엔 초대장을 보내요.")
              : undefined
        }
      />

      <CatalogControls
        active={active}
        count={!nearby && loaded && brands.length > 0 ? t("브랜드 {count}곳", { count: shown.length }) : undefined}
        filters={
          <label className="catalog-select">
            <span aria-hidden="true">{t("업종")}</span>
            <select
              aria-label={t("업종")} onChange={(event) => setIndustry(event.target.value as Industry | "")} value={industry}>
              <option value="">{t("모든 업종")}</option>
              {industries.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)} ({brands.filter((brand) => brand.industry === value).length})
                </option>
              ))}
            </select>
          </label>
        }
        layout={nearby ? undefined : { value: layout, onChange: setLayout }}
        onClearAll={clearAll}
        scope={{
          items: scopes.map((item) => ({ value: item, label: t(item) })),
          value: scope,
          onChange: pickScope,
          label: t("브랜드 보기"),
        }}
        scoreSide={nearby ? undefined : "학생단체"}
        search={
          nearby
            ? undefined
            : { value: query, onChange: setQuery, label: t("브랜드 검색"), placeholder: t("이름 · 업종 · 태그") }
        }
        sort={
          nearby
            ? undefined
            : {
                options: (["score", "popular", "near"] as const).map((value) => ({ value, label: t(sortLabels[value]) })),
                value: sort,
                onChange: setSort,
              }
        }
      />

      {/* 가장 가까운 곳은 카카오의 실제 가게로 대부분 아직 uniconnect에 없고 별도 목록에
         둔다(방문자에게는 꾸며 낸 가게). */}
      {nearby ? (
        <DemoPreview
          active={visitor}
          title={t("학교마다 근처 가게가 달라요")}
          text={t("지금은 예시 가게예요. 로그인하면 우리 학교 앞 실제 가게가 보여요.")}
          onLogin={onLogin}
          onSignup={onSignup}
        >
          <NearbyPlaces
            brands={brands}
            onCancelProposal={onCancelProposal}
            onInvite={onInvite}
            onOpenDetail={onOpenDetail}
            onPropose={onPropose}
            proposals={proposals}
            statuses={statuses}
          />
        </DemoPreview>
      ) : !loaded ? (
        <CatalogSkeleton />
      ) : brands.length === 0 ? (
        <CatalogEmpty
          title={t("아직 가입한 브랜드가 없어요")}
          text={t("가까운 순에서 학교 앞 가게에 초대장을 보내 보세요. 가입하면 여기서 제안할 수 있어요.")}
          action={{ label: t("학교 앞 가게 보기"), onClick: () => pickScope("학교 앞 가게") }}
        />
      ) : scope === "찜" && base.length === 0 ? (
        visitor ? (
          <CatalogEmpty
            title={t("로그인하면 찜할 수 있어요")}
            text={t("마음에 드는 브랜드를 하트로 모아 두고 여기에서 다시 볼 수 있어요.")}
            action={{ label: t("로그인"), onClick: onLogin }}
          />
        ) : (
          <CatalogEmpty
            title={t("아직 찜한 브랜드가 없어요")}
            text={t("카드의 하트를 누르면 여기에 모여요.")}
            action={{ label: t("전체 브랜드 보기"), onClick: () => pickScope("전체") }}
          />
        )
      ) : shown.length === 0 && active.length > 0 ? (
        <CatalogEmpty
          title={t("조건에 맞는 브랜드가 없어요")}
          text={t("검색어나 업종을 바꾸거나 조건을 지워 보세요.")}
          action={{ label: t("조건 모두 지우기"), onClick: clearAll }}
        />
      ) : layout === "map" ? (
        <CatalogMap
          center={t("우리 학교")}
          key={listKey}
          matches={shown}
          noPlace={t("학교 위치를 알 수 없어 지도에 그릴 수 없어요. 목록으로 보세요.")}
          renderCard={(match) => card(match)}
        />
      ) : (
        <ul
          className="work-grid stagger slide"
          data-direction={direction}
          key={listKey}
        >
          {shown.map((match, index) => {
            const rank = sort === "popular" ? index + 1 : undefined
            return (
              <li key={match.id} style={{ "--i": index } as CSSProperties}>
                {card(match, rank)}
              </li>
            )
          })}
        </ul>
      )}

      <CompareTray
        items={compare.ids.flatMap((id) => new Map([...matches, ...brands].map((item) => [item.id, item])).get(id) ?? [])}
        kind="brand"
        onClear={compare.clear}
        onOpenDetail={onOpenDetail}
        onRemove={compare.remove}
      />
    </section>
  )
}
