import { useState, type CSSProperties } from "react"

import { CatalogSearch } from "../components/CatalogSearch"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { TabBar } from "../components/TabBar"
import { WorkCard } from "../components/WorkCard"
import { t } from "../i18n"
import { todayIso } from "../lib/date"
import { nearestFirst } from "../lib/distance"
import { matchesGroupFilters, matchesQuery, noGroupFilters, type GroupFilters } from "../lib/search"
import type { Industry, Match, RequestStatus } from "../types"

type Tab = "추천" | "가까운 순" | "행사 임박" | "전체" | "분야별"

const tabs: Tab[] = ["추천", "가까운 순", "행사 임박", "전체", "분야별"]

const tabIntro: Record<Tab, { title: string; caption: string }> = {
  추천: {
    title: "캠페인에 맞는 학생단체를 찾았어요",
    caption: "타깃, 행사 규모, 지난 협찬 성과를 함께 분석한 결과예요.",
  },
  "가까운 순": {
    title: "매장에서 가까운 학생단체예요",
    caption: "우리 매장에서 학교까지 가까운 순서예요. 매장 주소는 내 정보에서 적을 수 있어요.",
  },
  "행사 임박": {
    title: "곧 행사를 여는 학생단체예요",
    caption: "행사일이 가까운 순서예요. 지금 제안하면 이번 행사에 함께할 수 있어요.",
  },
  전체: {
    title: "협찬할 수 있는 학생단체 전체예요",
    caption: "우리 브랜드와 일치율이 높은 순서로 보여드려요.",
  },
  분야별: {
    title: "분야별로 학생단체를 찾아보세요",
    caption: "원하는 분야를 고르면 해당 단체만 보여드려요.",
  },
}

// Order and names of the field filters.
const fieldLabels: [Industry, string][] = [
  ["performance", "공연·행사"],
  ["content", "콘텐츠"],
  ["sports", "스포츠"],
  ["wellness", "봉사"],
  ["education", "학술"],
]

// Student groups brands can sponsor, by tab.
export function GroupsPage({
  matches,
  groups,
  proposals,
  statuses,
  onOpenDetail,
  onPropose,
  onCancelProposal,
}: {
  // Top picks for this brand.
  matches: Match[]
  // Every student group in the catalog.
  groups: Match[]
  proposals: string[]
  // Each group's answer to the brand's offer, once it has one.
  statuses: Partial<Record<string, RequestStatus>>
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
}) {
  const [tab, setTab] = useState<Tab>("추천")
  const [field, setField] = useState<Industry>("performance")
  // Cards slide in from the side the picked tab or chip lies on.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickTab = (next: Tab) => {
    setDirection(tabs.indexOf(next) >= tabs.indexOf(tab) ? "forward" : "back")
    setTab(next)
  }
  const fields = fieldLabels.filter(([value]) => groups.some((group) => group.industry === value))
  const today = todayIso()
  // Words to find and the filters, kept across the tabs.
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<GroupFilters>(noGroupFilters)
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
          : groups.filter((group) => group.industry === field)
  const shown = list.filter((group) => matchesQuery(group, query) && matchesGroupFilters(group, filters, today))

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Find Student Groups"
        title={t(tabIntro[tab].title)}
        description={t(tabIntro[tab].caption)}
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
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="day-empty" key={tab}>
          {t("조건에 맞는 학생단체가 없어요.")}
        </p>
      ) : (
        <ul
          className="work-grid stagger slide"
          data-direction={direction}
          key={tab === "분야별" ? `${tab}-${field}` : tab}
        >
          {shown.map((group, index) => (
            <li key={group.id} style={{ "--i": index } as CSSProperties}>
              <WorkCard
                match={group}
                meta={`${group.school} · ${t(group.category)}`}
                onOpenDetail={() => onOpenDetail(group)}
                date={group.eventDate}
                tags={
                  <>
                    {group.eventName && <span className="tag-event">{group.eventName}</span>}
                    {group.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </>
                }
              >
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
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
