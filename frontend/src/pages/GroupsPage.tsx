import { useState, type CSSProperties } from "react"

import { DateLine } from "../components/DateLine"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { TabBar } from "../components/TabBar"
import { WorkCard } from "../components/WorkCard"
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
      <PageIntro
        eyebrow="Find student groups"
        title={tabIntro[tab].title}
        description={tabIntro[tab].caption}
        actions={<span className="intro-count">{list.length}곳</span>}
      />

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
            items={fields.map(([value, label]) => ({
              value,
              label: (
                <>
                  {label} <em className="chip-count">{groups.filter((group) => group.industry === value).length}</em>
                </>
              ),
            }))}
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

      {list.length === 0 ? (
        <p className="day-empty" key={tab}>
          조건에 맞는 학생단체가 없어요.
        </p>
      ) : (
        <ul
          className="work-grid stagger slide"
          data-direction={direction}
          key={tab === "분야별" ? `${tab}-${field}` : tab}
        >
          {list.map((group, index) => (
            <li key={group.id} style={{ "--i": index } as CSSProperties}>
              <WorkCard
                match={group}
                meta={`${group.school} · ${group.category}`}
                onOpenDetail={() => onOpenDetail(group)}
                tags={
                  <>
                    {/* The date and the event's features each take their own line. */}
                    {group.eventDate && <DateLine date={group.eventDate} />}
                    {group.eventName && <span className="tag-event">{group.eventName}</span>}
                    {group.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </>
                }
              >
                <button className="cancel-button" onClick={() => onOpenDetail(group)} type="button">
                  상세 정보
                </button>
                <ProposalControl
                  done={proposals.includes(group.id)}
                  label="협찬 제안하기"
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
