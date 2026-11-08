import { useState, type CSSProperties } from "react"

import { CatalogEmpty } from "../components/CatalogEmpty"
import { CatalogSkeleton } from "../components/CatalogSkeleton"
import { CatalogMap, LayoutSwitch, type Layout } from "../components/CatalogMap"
import { CatalogSearch } from "../components/CatalogSearch"
import { CompareTray, useCompare } from "../components/CompareTray"
import { DemoPreview } from "../components/DemoPreview"
import { NearbyPlaces } from "../components/NearbyPlaces"
import { PageIntro } from "../components/PageIntro"
import { ProposalControl } from "../components/ProposalControl"
import { TabBar } from "../components/TabBar"
import { WorkCard } from "../components/WorkCard"
import { brandIndustries } from "../data/industries"
import { useEntryState } from "../hooks/useEntryState"
import { t, tc } from "../i18n"
import { shownTags } from "../lib/distance"
import { matchesQuery } from "../lib/search"
import type { Industry, Match, NearbyPlace, RequestStatus } from "../types"

type Tab = "추천" | "가까운 순" | "인기" | "전체" | "업종별" | "찜"

const tabs: Tab[] = ["전체", "추천", "인기", "가까운 순", "업종별", "찜"]

const tabIntro: Record<Tab, { title: string; caption: string }> = {
  추천: {
    title: "내 행사에 맞는 브랜드를 찾았어요",
    caption: "행사 · 타깃 · 지난 성과로 골랐어요.",
  },
  "가까운 순": {
    title: "학교에서 가까운 가게예요",
    caption: "학교 앞 실제 가게예요. 아직 없는 곳엔 초대장을 보내 보세요.",
  },
  인기: {
    title: "학생단체가 많이 찾는 브랜드예요",
    caption: "이번 학기 협찬을 많이 한 순서예요.",
  },
  전체: {
    title: "협찬할 수 있는 브랜드 전체예요",
    caption: "우리 행사와 잘 맞는 순서예요.",
  },
  업종별: {
    title: "업종별로 브랜드를 찾아보세요",
    caption: "업종을 고르면 그 브랜드만 보여요.",
  },
  찜: {
    title: "찜한 브랜드예요",
    caption: "하트로 모아 둔 브랜드예요. 최근 순으로 보여요.",
  },
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
  const [tab, setTab] = useEntryState<Tab>("matches:tab", "전체")
  // 비교: 카드를 나란히 놓는다(components/CompareTray.tsx).
  const compare = useCompare()
  // 카드는 고른 탭이나 칩이 있는 쪽에서 미끄러져 들어온다.
  const [direction, setDirection] = useState<"forward" | "back">("forward")
  const pickTab = (next: Tab) => {
    setDirection(tabs.indexOf(next) >= tabs.indexOf(tab) ? "forward" : "back")
    setTab(next)
  }
  const industries = brandIndustries.filter(([industry]) =>
    brands.some((brand) => brand.industry === industry),
  )
  const [industry, setIndustry] = useEntryState<Industry>("matches:industry", "cafe")
  // 찾을 단어. 브랜드 탭을 바꿔도 유지한다.
  const [query, setQuery] = useEntryState("matches:query", "")
  // 카드를 목록으로, 또는 캠퍼스 둘레 지도의 점으로 보여 준다.
  const [layout, setLayout] = useEntryState<Layout>("matches:layout", "list")

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
  // 가입한 브랜드가 아직 없으면 추천은 찾았다고 말할 수 없다.
  const waiting = loaded && brands.length === 0 && tab === "추천"

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
        eyebrow={tc("eyebrow", "추천 매칭")}
        title={waiting ? t("브랜드가 가입하면 여기에 추천해 드려요") : t(intro.title)}
        description={
          waiting
            ? t("행사 · 타깃 · 지난 성과로 잘 맞는 브랜드부터 보여 드려요.")
            : visitor && tab === "가까운 순"
              ? t("학교 앞 가게를 가까운 순으로 보여 드려요. 아직 없는 가게엔 초대장을 보내 보세요.")
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
            onChange={(value, button) => {
              const order = industries.map(([item]) => item)
              setDirection(order.indexOf(value) >= order.indexOf(industry) ? "forward" : "back")
              setIndustry(value)
              // 칩 줄은 휴대폰에서 옆으로 스크롤된다. 고른 칩이 보이게 한다.
              button.scrollIntoView({ block: "nearest", inline: "center" })
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

      {/* 가장 가까운 곳은 카카오의 실제 가게로 대부분 아직 uniconnect에 없고 별도 목록에
         둔다(방문자에게는 꾸며 낸 가게). */}
      {tab === "가까운 순" ? (
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
