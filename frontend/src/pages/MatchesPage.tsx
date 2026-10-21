import { useState, type CSSProperties } from "react"

import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { TabBar } from "../components/TabBar"
import { WorkCard } from "../components/WorkCard"
import type { Industry, Match, RequestStatus } from "../types"

type Tab = "추천" | "인기" | "전체" | "업종별"

const tabs: Tab[] = ["추천", "인기", "전체", "업종별"]

const tabIntro: Record<Tab, { title: string; caption: string }> = {
  추천: {
    title: "내 행사에 맞는 브랜드를 찾았어요",
    caption: "행사 정보, 타깃, 거리와 지난 성과를 함께 분석한 결과예요.",
  },
  인기: {
    title: "학생단체가 많이 찾는 브랜드예요",
    caption: "이번 학기 협찬을 많이 한 순서로 보여드려요.",
  },
  전체: {
    title: "협찬할 수 있는 브랜드 전체예요",
    caption: "우리 행사와 일치율이 높은 순서로 보여드려요.",
  },
  업종별: {
    title: "업종별로 브랜드를 찾아보세요",
    caption: "원하는 업종을 고르면 해당 브랜드만 보여드려요.",
  },
}

// Order and names of the industry filters.
const industryLabels: [Industry, string][] = [
  ["cafe", "카페·식음료"],
  ["beauty", "뷰티"],
  ["photo", "사진"],
  ["content", "영상·콘텐츠"],
  ["wellness", "웰니스·F&B"],
  ["education", "교육"],
  ["sports", "스포츠"],
]

// Brands for student groups to propose to, by tab.
export function MatchesPage({
  matches,
  brands,
  proposals,
  statuses,
  onOpenDetail,
  onPropose,
  onCancelProposal,
}: {
  // Top picks for the group's events.
  matches: Match[]
  // Every brand in the catalog.
  brands: Match[]
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
}) {
  const [tab, setTab] = useState<Tab>("추천")
  // Cards slide in from the side the picked tab or chip lies on.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickTab = (next: Tab) => {
    setDirection(tabs.indexOf(next) >= tabs.indexOf(tab) ? "forward" : "back")
    setTab(next)
  }
  const industries = industryLabels.filter(([industry]) =>
    brands.some((brand) => brand.industry === industry),
  )
  const [industry, setIndustry] = useState<Industry>("cafe")

  const list =
    tab === "추천"
      ? matches
      : tab === "인기"
        ? [...brands].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        : tab === "전체"
          ? brands
          : brands.filter((brand) => brand.industry === industry)
  const intro = tabIntro[tab]

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Smart match"
        title={intro.title}
        description={intro.caption}
      />

      <div className="match-filters">
        <TabBar
          items={tabs.map((item) => ({ value: item, label: item }))}
          label="브랜드 보기"
          onChange={pickTab}
          value={tab}
        />
        {tab === "업종별" && (
          <TabBar
            chips
            items={industries.map(([value, label]) => ({
              value,
              label: (
                <>
                  {label} <em className="chip-count">{brands.filter((brand) => brand.industry === value).length}</em>
                </>
              ),
            }))}
            label="업종"
            onChange={(value, event) => {
              const order = industries.map(([item]) => item)
              setDirection(order.indexOf(value) >= order.indexOf(industry) ? "forward" : "back")
              setIndustry(value)
              // The chip row scrolls sideways on phones; keep the pick in view.
              event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" })
            }}
            value={industry}
          />
        )}
      </div>

      <ul
        className="work-grid stagger slide"
        data-direction={direction}
        key={tab === "업종별" ? `${tab}-${industry}` : tab}
      >
        {list.map((match, index) => {
          const rank = tab === "인기" ? index + 1 : undefined
          return (
            <li key={match.id} style={{ "--i": index } as CSSProperties}>
              <WorkCard
                match={match}
                meta={match.category}
                rank={rank}
                onOpenDetail={() => onOpenDetail(match)}
                tags={
                  <>
                    {rank !== undefined && match.popularity !== undefined && (
                      <span className="tag-hot">협찬 {match.popularity}회</span>
                    )}
                    {match.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </>
                }
              >
                <button className="cancel-button" onClick={() => onOpenDetail(match)} type="button">
                  상세 정보
                </button>
                <ProposalControl
                  done={proposals.includes(match.id)}
                  status={statuses[match.id]}
                  label="협찬 제안 보내기"
                  className="primary-button"
                  onPropose={() => onPropose(match)}
                  onCancel={() => onCancelProposal(match)}
                />
              </WorkCard>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
