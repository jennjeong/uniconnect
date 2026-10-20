import { useState } from "react"

import { BrandMark } from "../components/BrandMark"
import { DateLine } from "../components/DateLine"
import { ProposalControl } from "../components/ProposalControl"
import { ScoreRing } from "../components/ScoreRing"
import { TabBar } from "../components/TabBar"
import { todayIso } from "../lib/date"
import type { Industry, Match } from "../types"

type Tab = "추천" | "행사 임박" | "전체" | "분야별"

const tabs: Tab[] = ["추천", "행사 임박", "전체", "분야별"]

const tabIntro: Record<Tab, { title: string; caption: string }> = {
  추천: {
    title: "캠페인에 맞는 학생단체를 찾았어요",
    caption: "타깃, 행사 규모, 지난 협찬 성과를 함께 분석한 결과예요.",
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

function GroupCard({
  group,
  done,
  onOpenDetail,
  onPropose,
  onCancel,
}: {
  group: Match
  done: boolean
  onOpenDetail: () => void
  onPropose: () => void
  onCancel: () => void
}) {
  return (
    <article className="full-match-card group-card">
      <BrandMark match={group} large />
      <div className="full-match-copy">
        <span>
          {group.school} · {group.category}
        </span>
        <strong>{group.name}</strong>
        <p>{group.offer}</p>
        {/* The date and the event's features each take their own line. */}
        {group.eventDate && <DateLine date={group.eventDate} />}
        <div className="tag-row">
          {group.eventName && <span className="tag-event">{group.eventName}</span>}
          {group.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      </div>
      <ScoreRing score={group.score} />
      <div className="card-actions">
        <button className="cancel-button" onClick={onOpenDetail} type="button">
          상세 정보
        </button>
        <ProposalControl
          done={done}
          label="협찬 제안하기"
          className="primary-button"
          onPropose={onPropose}
          onCancel={onCancel}
        />
      </div>
    </article>
  )
}

// Student groups brands can sponsor, by tab.
export function GroupsPage({
  matches,
  groups,
  proposals,
  onOpenDetail,
  onPropose,
  onCancelProposal,
}: {
  // Top picks for this brand.
  matches: Match[]
  // Every student group in the catalog.
  groups: Match[]
  proposals: string[]
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

  const list =
    tab === "추천"
      ? matches
      : tab === "행사 임박"
        ? groups
            .filter((group) => group.eventDate && group.eventDate >= today)
            .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""))
        : tab === "전체"
          ? groups
          : groups.filter((group) => group.industry === field)

  return (
    <section className="page-view">
      <div className="view-intro match-intro groups-intro">
        <div key={tab}>
          <span className="section-kicker">FIND STUDENT GROUPS</span>
          <p>{tabIntro[tab].title}</p>
          <small>{tabIntro[tab].caption}</small>
        </div>
      </div>

      <div className="match-filters">
        <TabBar
          items={tabs.map((item) => ({ value: item, label: item }))}
          label="학생단체 보기"
          onChange={pickTab}
          value={tab}
        />
        {tab === "분야별" && (
          <TabBar
            chips
            items={fields.map(([value, label]) => ({ value, label }))}
            label="분야"
            onChange={(value, event) => {
              const order = fields.map(([item]) => item)
              setDirection(order.indexOf(value) >= order.indexOf(field) ? "forward" : "back")
              setField(value)
              event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" })
            }}
            value={field}
          />
        )}
      </div>

      <div
        className="full-match-grid stagger slide"
        data-direction={direction}
        key={tab === "분야별" ? `${tab}-${field}` : tab}
      >
        {list.length === 0 ? (
          <p className="day-empty">조건에 맞는 학생단체가 없어요.</p>
        ) : (
          list.map((group) => (
            <GroupCard
              done={proposals.includes(group.id)}
              group={group}
              key={group.id}
              onCancel={() => onCancelProposal(group)}
              onOpenDetail={() => onOpenDetail(group)}
              onPropose={() => onPropose(group)}
            />
          ))
        )}
      </div>
    </section>
  )
}
