import { useState, type CSSProperties } from "react"

import { CatalogEmpty } from "../components/CatalogEmpty"
import { CatalogMap, LayoutSwitch, type Layout } from "../components/CatalogMap"
import { CatalogSearch } from "../components/CatalogSearch"
import { DemoPreview } from "../components/DemoPreview"
import { NearbyPlaces } from "../components/NearbyPlaces"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { TabBar } from "../components/TabBar"
import { WorkCard } from "../components/WorkCard"
import { brandIndustries } from "../data/industries"
import { t } from "../i18n"
import { shownTags } from "../lib/distance"
import { matchesQuery } from "../lib/search"
import type { Industry, Match, NearbyPlace, RequestStatus } from "../types"

type Tab = "추천" | "가까운 순" | "인기" | "전체" | "업종별" | "찜"

const tabs: Tab[] = ["추천", "가까운 순", "인기", "전체", "업종별", "찜"]

const tabIntro: Record<Tab, { title: string; caption: string }> = {
  추천: {
    title: "내 행사에 맞는 브랜드를 찾았어요",
    caption: "행사 정보, 타깃과 지난 성과를 함께 분석한 결과예요.",
  },
  "가까운 순": {
    title: "학교에서 가까운 가게예요",
    caption: "카카오 지도에서 지금 찾은 학교 주변의 실제 가게예요. 아직 uniconnect와 협약하지 않은 곳은 초대장을 보내 가입을 권해 보세요.",
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
  찜: {
    title: "찜한 브랜드예요",
    caption: "하트를 눌러 모아 둔 브랜드예요. 최근에 찜한 순서로 보여 드려요.",
  },
}

// Brands for student groups to propose to, by tab.
export function MatchesPage({
  matches,
  brands,
  loaded,
  proposals,
  statuses,
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
  // Top picks for the group's events.
  matches: Match[]
  // Every brand in the catalog: brands that signed up, for a member.
  brands: Match[]
  // The catalog has arrived, so an empty one is empty.
  loaded: boolean
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  // The brands the account saved (찜), newest first, and the heart on each card.
  saved: string[]
  onToggleSave: (match: Match) => void
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // Invites a shop from 가까운 순 (true once the invitation exists).
  onInvite: (place: NearbyPlace) => Promise<boolean>
  // Logged out: 가까운 순 shows made-up shops around the demo group's campus,
  // marked as an example.
  visitor: boolean
  onLogin: () => void
  onSignup: () => void
}) {
  const [tab, setTab] = useState<Tab>("추천")
  // Cards slide in from the side the picked tab or chip lies on.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickTab = (next: Tab) => {
    setDirection(tabs.indexOf(next) >= tabs.indexOf(tab) ? "forward" : "back")
    setTab(next)
  }
  const industries = brandIndustries.filter(([industry]) =>
    brands.some((brand) => brand.industry === industry),
  )
  const [industry, setIndustry] = useState<Industry>("cafe")
  // Words to find, kept across the brand tabs.
  const [query, setQuery] = useState("")
  // The cards as a list, or as dots on a map around the campus.
  const [layout, setLayout] = useState<Layout>("list")

  const list =
    tab === "추천"
      ? matches
      : tab === "가까운 순"
        ? []
        : tab === "인기"
        ? [...brands].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        : tab === "전체"
          ? brands
          : tab === "찜"
            ? saved.flatMap((id) => brands.filter((brand) => brand.id === id))
            : brands.filter((brand) => brand.industry === industry)
  const shown = list.filter((match) => matchesQuery(match, query))
  const intro = tabIntro[tab]
  // With no brand signed up yet, 추천 can't say it found some.
  const waiting = loaded && brands.length === 0 && tab === "추천"

  // A brand's card, as the list and the map show it (`rank` on 인기).
  const card = (match: Match, rank?: number) => (
    <WorkCard
      match={match}
      meta={t(match.category)}
      rank={rank}
      onOpenDetail={() => onOpenDetail(match)}
      saved={saved.includes(match.id)}
      onToggleSave={() => onToggleSave(match)}
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
        label={t("협찬 제안 보내기")}
        className="primary-button"
        onPropose={() => onPropose(match)}
        onCancel={() => onCancelProposal(match)}
      />
    </WorkCard>
  )

  return (
    <section className="page-view">
      <PageIntro
        eyebrow="Smart Match"
        title={waiting ? t("브랜드가 가입하면 여기에 추천해 드려요") : t(intro.title)}
        description={
          waiting
            ? t("행사 정보, 타깃과 지난 성과를 함께 분석해 잘 맞는 브랜드부터 보여 드려요.")
            : visitor && tab === "가까운 순"
              ? t("학교 주변 가게를 가까운 순서로 보여 드려요. 아직 uniconnect와 협약하지 않은 곳은 초대장을 보내 가입을 권해 보세요.")
              : t(intro.caption)
        }
      />

      <div className="match-filters">
        <TabBar
          items={tabs.map((item) => ({ value: item, label: t(item) }))}
          label={t("브랜드 보기")}
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
                  {t(label)} <em className="chip-count">{brands.filter((brand) => brand.industry === value).length}</em>
                </>
              ),
            }))}
            label={t("업종")}
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
        {tab !== "가까운 순" && (
          <CatalogSearch
            label={t("브랜드 검색")}
            onChange={setQuery}
            placeholder={t("브랜드 이름, 업종, 태그로 찾기")}
            value={query}
          />
        )}
        {tab !== "가까운 순" && <LayoutSwitch onChange={setLayout} value={layout} />}
      </div>

      {/* The nearest are real shops from Kakao, mostly not on uniconnect yet, in their own list (made-up ones for visitors). */}
      {tab === "가까운 순" ? (
        <DemoPreview
          active={visitor}
          title={t("학교마다 근처 가게가 달라요")}
          text={t("지금 보이는 가게는 데모 단체의 학교 근처에 있다고 가정해 만든 예시예요. 로그인하면 카카오 지도에서 찾은 우리 학교 근처의 실제 가게를 볼 수 있어요.")}
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
      ) : loaded && brands.length === 0 ? (
        <CatalogEmpty
          title={t("아직 가입한 브랜드가 없어요")}
          text={t("가까운 순에서 학교 근처 가게를 찾아 초대장을 보내 보세요. 가게가 브랜드로 가입하면 여기에서 협찬을 제안할 수 있어요.")}
          action={{ label: t("가까운 가게 보기"), onClick: () => pickTab("가까운 순") }}
        />
      ) : tab === "찜" && list.length === 0 ? (
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
            action={{ label: t("전체 브랜드 보기"), onClick: () => pickTab("전체") }}
          />
        )
      ) : shown.length === 0 && query.trim() ? (
        <p className="day-empty">{t("찾는 브랜드가 없어요. 다른 낱말로 찾아보세요.")}</p>
      ) : layout === "map" ? (
        <CatalogMap
          center={t("우리 학교")}
          key={tab === "업종별" ? `${tab}-${industry}` : tab}
          matches={shown}
          noPlace={t("학교 위치를 알 수 없어 지도에 그릴 수 없어요. 목록으로 보세요.")}
          renderCard={(match) => card(match)}
        />
      ) : (
        <ul
          className="work-grid stagger slide"
          data-direction={direction}
          key={tab === "업종별" ? `${tab}-${industry}` : tab}
        >
          {shown.map((match, index) => {
            const rank = tab === "인기" ? index + 1 : undefined
            return (
              <li key={match.id} style={{ "--i": index } as CSSProperties}>
                {card(match, rank)}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
