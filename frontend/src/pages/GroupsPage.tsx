import { useState, type CSSProperties } from "react"

import { CatalogEmpty } from "../components/CatalogEmpty"
import { CatalogSkeleton } from "../components/CatalogSkeleton"
import { type ActiveCondition, CatalogControls } from "../components/CatalogControls"
import { CatalogMap, type Layout } from "../components/CatalogMap"
import { CompareTray, useCompare } from "../components/CompareTray"
import { DemoPreview } from "../components/DemoPreview"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { WorkCard } from "../components/WorkCard"
import { eventKinds } from "../data/eventDetails"
import { groupFields } from "../data/industries"
import { regions, universities, type Region } from "../data/universities"
import { useEntryState } from "../hooks/useEntryState"
import { t, tc } from "../i18n"
import { todayIso } from "../lib/date"
import { nearestFirst, shownTags } from "../lib/distance"
import { matchesGroupFilters, matchesQuery, noGroupFilters, type GroupFilters } from "../lib/search"
import type { Industry, Match, RequestStatus } from "../types"

// 범위: 무엇을 보는지. 정렬과 필터는 범위와 따로 고른다(components/CatalogControls.tsx).
type Scope = "전체" | "추천" | "찜"
type Sort = "score" | "near" | "soon"

// 제안 하나를 한꺼번에 보낼 수 있는 최대 단체 수(App의 proposeMany).
export const maxBulk = 10

const scopes: Scope[] = ["추천", "전체", "찜"]

const sortLabels: Record<Sort, string> = {
  score: "추천 지수순",
  near: "가까운 순",
  soon: "행사 임박순",
}

const sizeLabels: Record<GroupFilters["size"], string> = {
  all: "모든 규모",
  small: "100명 미만",
  medium: "100~299명",
  large: "300명 이상",
  unknown: "인원 미정",
}

const whenLabels: Record<GroupFilters["when"], string> = {
  all: "모든 시기",
  thisMonth: "이번 달",
  nextMonth: "다음 달",
  later: "그 뒤",
  unknown: "날짜 미정",
}

// 브랜드가 협찬할 수 있는 학생단체. 탭별.
export function GroupsPage({
  matches,
  groups,
  loaded,
  onEditProfile,
  proposals,
  statuses,
  undelivered = [],
  saved,
  onToggleSave,
  onOpenDetail,
  onPropose,
  onCancelProposal,
  onProposeMany,
  visitor,
  onLogin,
  onSignup,
}: {
  // 이 브랜드의 추천 상위.
  matches: Match[]
  // 카탈로그의 모든 학생단체. 회원에게는 가입한 단체만.
  groups: Match[]
  // 카탈로그가 도착했으므로 비어 있으면 정말 비어 있다.
  loaded: boolean
  // 브랜드가 단체가 찾을 내용을 쓰는 내 정보의 폼.
  onEditProfile: () => void
  proposals: string[]
  // 브랜드의 제안에 대한 각 단체의 답. 있을 때만.
  statuses: Partial<Record<string, RequestStatus>>
  // 받은편지함이 없는(가입하지 않은) 상대에게 보낸 제안. 카드는 "전달 대기"로 보인다.
  undelivered?: string[]
  // 계정이 저장한 단체(찜)를 최신순으로, 그리고 각 카드의 하트.
  saved: string[]
  onToggleSave: (match: Match) => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // 여러 단체에 보내는 제안 하나(일괄 제안). 회원 전용.
  onProposeMany?: (groups: Match[]) => void
  // 로그아웃 상태: 가까운 순은 데모 브랜드의 가게를 기준으로 재므로 예시로
  // 읽힌다.
  visitor: boolean
  onLogin: () => void
  onSignup: () => void
}) {
  const [scope, setScope] = useEntryState<Scope>("groups:scope", "추천")
  const [sort, setSort] = useEntryState<Sort>("groups:sort", "score")
  // 비교: 카드를 나란히 놓는다(components/CompareTray.tsx).
  const compare = useCompare()
  // 여러 곳에 제안: 카드에서 단체를 고르는 일과 고른 단체. 제안이 한 곳에
  // 닿으면 선택에서 빠진다.
  const [picking, setPicking] = useState(false)
  const [picks, setPicks] = useState<string[]>([])
  const picked = picks.filter((id) => !proposals.includes(id))
  const togglePick = (id: string) =>
    setPicks((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  // 분야 필터. 비워 두면 모든 분야.
  const [field, setField] = useEntryState<Industry | "">("groups:fieldFilter", "")
  // 카드는 고른 범위가 있는 쪽에서 미끄러져 들어온다.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickScope = (next: Scope) => {
    setDirection(scopes.indexOf(next) >= scopes.indexOf(scope) ? "forward" : "back")
    setScope(next)
  }
  const fields = groupFields.filter(([value]) => groups.some((group) => group.industry === value))
  const fieldLabel = fields.find(([value]) => value === field)?.[1]
  const today = todayIso()
  // 찾을 단어와 필터. 범위를 바꿔도 유지한다.
  const [query, setQuery] = useEntryState("groups:query", "")
  const [filters, setFilters] = useEntryState<GroupFilters>("groups:filters", noGroupFilters)
  // 카드를 목록으로, 또는 가게 둘레 지도의 점으로 보여 준다.
  const [layout, setLayout] = useEntryState<Layout>("groups:layout", "list")
  // 고른 지역의 모든 학교. 모든 지역이면 목록에 오른 단체가 속한 학교.
  const schools = filters.region
    ? universities[filters.region]
    : [...new Set(groups.flatMap((group) => (group.school ? [group.school] : [])))].sort()
  const clearAll = () => {
    setQuery("")
    setField("")
    setFilters(noGroupFilters)
    setSort("score")
  }

  const base = scope === "추천" ? matches : scope === "찜" ? saved.flatMap((id) => groups.filter((group) => group.id === id)) : groups
  const filtered = base.filter(
    (group) => matchesQuery(group, query) && (!field || group.industry === field) && matchesGroupFilters(group, filters, today),
  )
  // 행사 임박순: 다가오는 행사가 있는 단체를 날짜순으로 앞에, 나머지는 뒤에.
  const upcoming = (group: Match) => (group.eventDate && group.eventDate >= today ? group.eventDate : "9999-99-99")
  const shown =
    sort === "near"
      ? nearestFirst(filtered)
      : sort === "soon"
        ? [...filtered].sort((a, b) => upcoming(a).localeCompare(upcoming(b)))
        : [...filtered].sort((a, b) => b.score - a.score)
  const listKey = `${scope}-${sort}-${field}`

  const active: ActiveCondition[] = [
    ...(query.trim() ? [{ key: "query", label: t("‘{query}’ 검색", { query: query.trim() }), onClear: () => setQuery("") }] : []),
    ...(fieldLabel ? [{ key: "field", label: t("분야: {name}", { name: t(fieldLabel) }), onClear: () => setField("") }] : []),
    ...(filters.size !== "all"
      ? [{ key: "size", label: t("규모: {value}", { value: t(sizeLabels[filters.size]) }), onClear: () => setFilters({ ...filters, size: "all" }) }]
      : []),
    ...(filters.when !== "all"
      ? [{ key: "when", label: t("시기: {value}", { value: t(whenLabels[filters.when]) }), onClear: () => setFilters({ ...filters, when: "all" }) }]
      : []),
    ...(filters.kind
      ? [{ key: "kind", label: t("행사 유형: {value}", { value: t(filters.kind) }), onClear: () => setFilters({ ...filters, kind: "" }) }]
      : []),
    ...(filters.region
      ? [
          {
            key: "region",
            label: t("지역: {value}", { value: t(filters.region) }),
            onClear: () => setFilters({ ...filters, region: "", school: "" }),
          },
        ]
      : []),
    ...(filters.school
      ? [{ key: "school", label: t("학교: {value}", { value: filters.school }), onClear: () => setFilters({ ...filters, school: "" }) }]
      : []),
    ...(sort !== "score" ? [{ key: "sort", label: t(sortLabels[sort]), onClear: () => setSort("score") }] : []),
  ]

  // 목록과 지도가 보여 주는 단체의 카드.
  const card = (group: Match) => (
    <WorkCard
      match={group}
      meta={t(group.category)}
      onOpenDetail={() => onOpenDetail(group)}
      saved={saved.includes(group.id)}
      onToggleSave={() => onToggleSave(group)}
      compared={compare.has(group.id)}
      // 제안 하나에 보낼 단체를 고르는 일과 비교는 함께할 수 없다.
      onToggleCompare={picking ? undefined : () => compare.toggle(group.id)}
      date={group.eventDate}
      tags={
        <>
          {group.eventKind && <span className="tag-event">{t(group.eventKind)}</span>}
          {group.eventName && <span className="tag-event">{group.eventName}</span>}
          {shownTags(group).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </>
      }
    >
      {picking && (
        <label className="bulk-pick">
          <input
            checked={picked.includes(group.id)}
            disabled={proposals.includes(group.id) || (!picked.includes(group.id) && picked.length >= maxBulk)}
            onChange={() => togglePick(group.id)}
            type="checkbox"
          />
          <span>{proposals.includes(group.id) ? t("제안함") : t("{name} 고르기", { name: group.name })}</span>
        </label>
      )}
      <button className="cancel-button" onClick={() => onOpenDetail(group)} type="button">
        {t("상세 정보")}
      </button>
      <ProposalControl
        done={proposals.includes(group.id)}
        status={statuses[group.id]}
        undelivered={undelivered.includes(group.id)}
        label={t("제안하기")}
        className="primary-button"
        onPropose={() => onPropose(group)}
        onCancel={() => onCancelProposal(group)}
      />
    </WorkCard>
  )

  return (
    <section className="page-view">
      {/* 가입한 단체가 아직 없으면 추천은 찾았다고 말할 수 없다. */}
      <PageIntro
        compact
        eyebrow={tc("eyebrow", "단체 찾기")}
        title={loaded && groups.length === 0 && scope === "추천" ? t("학생단체가 가입하면 여기에 추천해 드려요") : t("학생단체 찾기")}
        description={
          loaded && groups.length === 0 && scope === "추천" ? t("우리 브랜드 소개와 잘 맞는 단체부터 보여 드려요.") : undefined
        }
      />

      <CatalogControls
        active={active}
        count={loaded && groups.length > 0 ? t("학생단체 {count}곳", { count: shown.length }) : undefined}
        extra={
          onProposeMany && (
            <button aria-pressed={picking} className="catalog-clear bulk-toggle" onClick={() => setPicking(!picking)} type="button">
              {picking ? t("고르기 끝내기") : t("여러 곳에 제안")}
            </button>
          )
        }
        filters={
          <>
            <label className="catalog-select">
              <span aria-hidden="true">{t("분야")}</span>
              <select
                aria-label={t("분야")} onChange={(event) => setField(event.target.value as Industry | "")} value={field}>
                <option value="">{t("모든 분야")}</option>
                {fields.map(([value, label]) => (
                  <option key={value} value={value}>
                    {t(label)} ({groups.filter((group) => group.industry === value).length})
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-select">
              <span aria-hidden="true">{t("행사 규모")}</span>
              <select
                aria-label={t("행사 규모")}
                onChange={(event) => setFilters({ ...filters, size: event.target.value as GroupFilters["size"] })}
                value={filters.size}
              >
                {(Object.keys(sizeLabels) as GroupFilters["size"][]).map((value) => (
                  <option key={value} value={value}>
                    {t(sizeLabels[value])}
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-select">
              <span aria-hidden="true">{t("행사 시기")}</span>
              <select
                aria-label={t("행사 시기")}
                onChange={(event) => setFilters({ ...filters, when: event.target.value as GroupFilters["when"] })}
                value={filters.when}
              >
                {(Object.keys(whenLabels) as GroupFilters["when"][]).map((value) => (
                  <option key={value} value={value}>
                    {t(whenLabels[value])}
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-select">
              <span aria-hidden="true">{t("행사 유형")}</span>
              <select
                aria-label={t("행사 유형")} onChange={(event) => setFilters({ ...filters, kind: event.target.value })} value={filters.kind}>
                <option value="">{t("모든 행사 유형")}</option>
                {eventKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-select">
              <span aria-hidden="true">{t("지역")}</span>
              <select
                aria-label={t("지역")}
                onChange={(event) => setFilters({ ...filters, region: event.target.value as Region | "", school: "" })}
                value={filters.region}
              >
                <option value="">{t("모든 지역")}</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {t(region)}
                  </option>
                ))}
              </select>
            </label>
            <label className="catalog-select">
              <span aria-hidden="true">{t("학교")}</span>
              <select
                aria-label={t("학교")} onChange={(event) => setFilters({ ...filters, school: event.target.value })} value={filters.school}>
                <option value="">{filters.region ? t("{region} 모든 학교", { region: t(filters.region) }) : t("모든 학교")}</option>
                {schools.map((school) => (
                  <option key={school} value={school}>
                    {school}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        layout={{ value: layout, onChange: setLayout }}
        onClearAll={clearAll}
        scope={{
          items: scopes.map((item) => ({ value: item, label: t(item) })),
          value: scope,
          onChange: pickScope,
          label: t("학생단체 보기"),
        }}
        scoreSide="브랜드"
        search={{ value: query, onChange: setQuery, label: t("학생단체 검색"), placeholder: t("이름 · 학교 · 행사 · 태그") }}
        sort={{
          options: (["score", "near", "soon"] as const).map((value) => ({ value, label: t(sortLabels[value]) })),
          value: sort,
          onChange: setSort,
        }}
      />

      <DemoPreview
        active={visitor && sort === "near"}
        title={t("매장마다 가까운 학생단체가 달라요")}
        text={t("지금은 예시 매장 기준이에요. 로그인하면 우리 매장 기준으로 보여요.")}
        onLogin={onLogin}
        onSignup={onSignup}
      >
        {!loaded ? (
          <CatalogSkeleton />
        ) : groups.length === 0 ? (
          <CatalogEmpty
            title={t("아직 가입한 학생단체가 없어요")}
            text={t("학생단체가 가입하면 여기서 찾아 제안해요. 소개를 먼저 써 두면 단체가 먼저 찾아와요.")}
            action={{ label: t("브랜드 소개 쓰기"), onClick: onEditProfile }}
          />
        ) : scope === "찜" && base.length === 0 ? (
          visitor ? (
            <CatalogEmpty
              title={t("로그인하면 찜할 수 있어요")}
              text={t("마음에 드는 학생단체를 하트로 모아 두고 여기에서 다시 볼 수 있어요.")}
              action={{ label: t("로그인"), onClick: onLogin }}
            />
          ) : (
            <CatalogEmpty
              title={t("아직 찜한 학생단체가 없어요")}
              text={t("카드의 하트를 누르면 여기에 모여요.")}
              action={{ label: t("전체 학생단체 보기"), onClick: () => pickScope("전체") }}
            />
          )
        ) : shown.length === 0 ? (
          <CatalogEmpty
            title={t("조건에 맞는 학생단체가 없어요")}
            text={t("검색어나 조건을 바꾸거나 지워 보세요.")}
            action={active.length > 0 ? { label: t("조건 모두 지우기"), onClick: clearAll } : undefined}
          />
        ) : layout === "map" ? (
          <CatalogMap
            center={t("내 매장")}
            key={listKey}
            matches={shown}
            noPlace={t("내 정보에 매장 주소를 적으면 학생단체의 캠퍼스를 지도에서 볼 수 있어요. 지금은 목록으로 보세요.")}
            renderCard={card}
          />
        ) : (
          <ul
            className="work-grid stagger slide"
            data-direction={direction}
            key={listKey}
          >
            {shown.map((group, index) => (
              <li key={group.id} style={{ "--i": index } as CSSProperties}>
                {card(group)}
              </li>
            ))}
          </ul>
        )}
      </DemoPreview>

      {picking && onProposeMany && (
        <div aria-label={t("여러 곳에 제안")} className="bulk-bar" role="region">
          <p>
            <strong>{t("{count}곳 골랐어요", { count: picked.length })}</strong>
            <small>{t("한 번에 {max}곳까지, 캠페인과 메시지 하나로 보내요.", { max: maxBulk })}</small>
          </p>
          <button
            className="primary-button"
            disabled={picked.length === 0}
            onClick={() => {
              // 추천이 고른 것이 전체 목록에 아직 없을 수 있다. 단체마다 한 번.
              const pool = new Map([...matches, ...groups].map((group) => [group.id, group]))
              onProposeMany(picked.flatMap((id) => pool.get(id) ?? []))
            }}
            type="button"
          >
            {t("한 번에 제안하기")}
          </button>
        </div>
      )}

      {!picking && (
      <CompareTray
        items={compare.ids.flatMap((id) => new Map([...matches, ...groups].map((item) => [item.id, item])).get(id) ?? [])}
        kind="group"
        onClear={compare.clear}
        onOpenDetail={onOpenDetail}
        onRemove={compare.remove}
      />
      )}
    </section>
  )
}
