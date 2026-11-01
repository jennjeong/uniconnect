import { useState, type CSSProperties } from "react"

import { CatalogEmpty } from "../components/CatalogEmpty"
import { CatalogSkeleton } from "../components/CatalogSkeleton"
import { CatalogMap, LayoutSwitch, type Layout } from "../components/CatalogMap"
import { CatalogSearch } from "../components/CatalogSearch"
import { CompareTray, useCompare } from "../components/CompareTray"
import { DemoPreview } from "../components/DemoPreview"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { TabBar } from "../components/TabBar"
import { WorkCard } from "../components/WorkCard"
import { eventKinds } from "../data/eventDetails"
import { groupFields } from "../data/industries"
import { t } from "../i18n"
import { todayIso } from "../lib/date"
import { nearestFirst, shownTags } from "../lib/distance"
import { matchesGroupFilters, matchesQuery, noGroupFilters, type GroupFilters } from "../lib/search"
import type { Industry, Match, RequestStatus } from "../types"

type Tab = "추천" | "가까운 순" | "행사 임박" | "전체" | "분야별" | "찜"

// As many groups as one offer goes to at once (App's proposeMany).
export const maxBulk = 10

const tabs: Tab[] = ["추천", "가까운 순", "행사 임박", "전체", "분야별", "찜"]

const tabIntro: Record<Tab, { title: string; caption: string }> = {
  추천: {
    title: "캠페인에 맞는 학생단체를 찾았어요",
    caption: "타깃 · 규모 · 지난 성과로 골랐어요.",
  },
  "가까운 순": {
    title: "매장에서 가까운 학생단체예요",
    caption: "매장에서 가까운 학교 순이에요. 매장 주소는 내 정보에서 적어요.",
  },
  "행사 임박": {
    title: "곧 행사를 여는 학생단체예요",
    caption: "행사가 코앞인 순서예요. 지금 제안하면 이번 행사에 함께해요.",
  },
  전체: {
    title: "협찬할 수 있는 학생단체 전체예요",
    caption: "우리 브랜드와 잘 맞는 순서예요.",
  },
  분야별: {
    title: "분야별로 학생단체를 찾아보세요",
    caption: "분야를 고르면 그 단체만 보여요.",
  },
  찜: {
    title: "찜한 학생단체예요",
    caption: "하트로 모아 둔 학생단체예요. 최근 순으로 보여요.",
  },
}

// Student groups brands can sponsor, by tab.
export function GroupsPage({
  matches,
  groups,
  loaded,
  onEditProfile,
  proposals,
  statuses,
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
  // Top picks for this brand.
  matches: Match[]
  // Every student group in the catalog: groups that signed up, for a member.
  groups: Match[]
  // The catalog has arrived, so an empty one is empty.
  loaded: boolean
  // 내 정보's form, where the brand writes what groups will find.
  onEditProfile: () => void
  proposals: string[]
  // Each group's answer to the brand's offer, once it has one.
  statuses: Partial<Record<string, RequestStatus>>
  // The groups the account saved (찜), newest first, and the heart on each card.
  saved: string[]
  onToggleSave: (match: Match) => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // One offer to several groups (일괄 제안); members only.
  onProposeMany?: (groups: Match[]) => void
  // Logged out: 가까운 순 measures from the demo brand's store, so it reads as an example.
  visitor: boolean
  onLogin: () => void
  onSignup: () => void
}) {
  const [tab, setTab] = useState<Tab>("추천")
  // 비교: the cards laid side by side (components/CompareTray.tsx).
  const compare = useCompare()
  // 여러 곳에 제안: picking groups on the cards, and those picked. Once an
  // offer reaches one it drops out of the picks.
  const [picking, setPicking] = useState(false)
  const [picks, setPicks] = useState<string[]>([])
  const picked = picks.filter((id) => !proposals.includes(id))
  const togglePick = (id: string) =>
    setPicks((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const [field, setField] = useState<Industry>("performance")
  // Cards slide in from the side the picked tab or chip lies on.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickTab = (next: Tab) => {
    setDirection(tabs.indexOf(next) >= tabs.indexOf(tab) ? "forward" : "back")
    setTab(next)
  }
  const fields = groupFields.filter(([value]) => groups.some((group) => group.industry === value))
  const today = todayIso()
  // Words to find and the filters, kept across the tabs.
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<GroupFilters>(noGroupFilters)
  // The cards as a list, or as dots on a map around the store.
  const [layout, setLayout] = useState<Layout>("list")
  const schools = [...new Set(groups.flatMap((group) => (group.school ? [group.school] : [])))].sort()
  const filtering = query.trim() !== "" || JSON.stringify(filters) !== JSON.stringify(noGroupFilters)
  const clear = () => {
    setQuery("")
    setFilters(noGroupFilters)
  }

  const list =
    tab === "추천"
      ? matches
      : tab === "가까운 순"
        ? nearestFirst(groups)
        : tab === "행사 임박"
        ? groups
            .filter((group) => group.eventDate && group.eventDate >= today)
            .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""))
        : tab === "전체"
          ? groups
          : tab === "찜"
            ? saved.flatMap((id) => groups.filter((group) => group.id === id))
            : groups.filter((group) => group.industry === field)
  const shown = list.filter((group) => matchesQuery(group, query) && matchesGroupFilters(group, filters, today))

  // A group's card, as the list and the map show it.
  const card = (group: Match) => (
    <WorkCard
      match={group}
      meta={`${group.school} · ${t(group.category)}`}
      onOpenDetail={() => onOpenDetail(group)}
      saved={saved.includes(group.id)}
      onToggleSave={() => onToggleSave(group)}
      compared={compare.has(group.id)}
      // Picking groups for one offer and comparing them don't mix.
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
        label={t("협찬 제안하기")}
        className="primary-button"
        onPropose={() => onPropose(group)}
        onCancel={() => onCancelProposal(group)}
      />
    </WorkCard>
  )

  return (
    <section className="page-view">
      {/* With no group signed up yet, 추천 can't say it found some. */}
      <PageIntro
        eyebrow="Find Student Groups"
        title={
          loaded && groups.length === 0 && tab === "추천"
            ? t("학생단체가 가입하면 여기에 추천해 드려요")
            : t(tabIntro[tab].title)
        }
        description={
          loaded && groups.length === 0 && tab === "추천"
            ? t("타깃 · 규모 · 지난 성과로 잘 맞는 단체부터 보여 드려요.")
            : t(tabIntro[tab].caption)
        }
      />

      <div className="match-filters">
        <TabBar
          items={tabs.map((item) => ({ value: item, label: t(item) }))}
          label={t("학생단체 보기")}
          onChange={pickTab}
          value={tab}
        />
        {tab === "분야별" && (
          <TabBar
            chips
            items={fields.map(([value, label]) => ({
              value,
              label: (
                <>
                  {t(label)} <em className="chip-count">{groups.filter((group) => group.industry === value).length}</em>
                </>
              ),
            }))}
            label={t("분야")}
            onChange={(value, event) => {
              const order = fields.map(([item]) => item)
              setDirection(order.indexOf(value) >= order.indexOf(field) ? "forward" : "back")
              setField(value)
              event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" })
            }}
            value={field}
          />
        )}
        <div className="catalog-tools">
          <CatalogSearch
            label={t("학생단체 검색")}
            onChange={setQuery}
            placeholder={t("단체 이름, 학교, 행사, 태그로 찾기")}
            value={query}
          />
          <span className="catalog-select">
            <select
              aria-label={t("행사 규모")}
              onChange={(event) => setFilters({ ...filters, size: event.target.value as GroupFilters["size"] })}
              value={filters.size}
            >
              <option value="all">{t("모든 규모")}</option>
              <option value="small">{t("100명 미만")}</option>
              <option value="medium">{t("100~299명")}</option>
              <option value="large">{t("300명 이상")}</option>
              <option value="unknown">{t("인원 미정")}</option>
            </select>
          </span>
          <span className="catalog-select">
            <select
              aria-label={t("행사 시기")}
              onChange={(event) => setFilters({ ...filters, when: event.target.value as GroupFilters["when"] })}
              value={filters.when}
            >
              <option value="all">{t("모든 시기")}</option>
              <option value="thisMonth">{t("이번 달")}</option>
              <option value="nextMonth">{t("다음 달")}</option>
              <option value="later">{t("그 뒤")}</option>
              <option value="unknown">{t("날짜 미정")}</option>
            </select>
          </span>
          <span className="catalog-select">
            <select
              aria-label={t("행사 유형")}
              onChange={(event) => setFilters({ ...filters, kind: event.target.value })}
              value={filters.kind}
            >
              <option value="">{t("모든 행사 유형")}</option>
              {eventKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(kind)}
                </option>
              ))}
            </select>
          </span>
          <span className="catalog-select">
            <select
              aria-label={t("학교")}
              onChange={(event) => setFilters({ ...filters, school: event.target.value })}
              value={filters.school}
            >
              <option value="">{t("모든 학교")}</option>
              {schools.map((school) => (
                <option key={school} value={school}>
                  {school}
                </option>
              ))}
            </select>
          </span>
          {filtering && (
            <button className="catalog-clear" onClick={clear} type="button">
              {t("조건 지우기")}
            </button>
          )}
          {onProposeMany && (
            <button aria-pressed={picking} className="catalog-clear bulk-toggle" onClick={() => setPicking(!picking)} type="button">
              {picking ? t("고르기 끝내기") : t("여러 곳에 제안")}
            </button>
          )}
        </div>
        <LayoutSwitch onChange={setLayout} value={layout} />
      </div>

      <DemoPreview
        active={visitor && tab === "가까운 순"}
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
        ) : tab === "찜" && list.length === 0 ? (
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
              action={{ label: t("전체 학생단체 보기"), onClick: () => pickTab("전체") }}
            />
          )
        ) : shown.length === 0 ? (
          <p className="day-empty" key={tab}>
            {t("조건에 맞는 학생단체가 없어요.")}
          </p>
        ) : layout === "map" ? (
          <CatalogMap
            center={t("내 매장")}
            key={tab === "분야별" ? `${tab}-${field}` : tab}
            matches={shown}
            noPlace={t("내 정보에 매장 주소를 적으면 학생단체의 캠퍼스를 지도에서 볼 수 있어요. 지금은 목록으로 보세요.")}
            renderCard={card}
          />
        ) : (
          <ul
            className="work-grid stagger slide"
            data-direction={direction}
            key={tab === "분야별" ? `${tab}-${field}` : tab}
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
              // 추천's picks may not be in the full list yet; each group once.
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
