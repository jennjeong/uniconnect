import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { franchiseLogos } from "../data/franchises"
import { placeCategories } from "../data/places"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { franchiseOf } from "../lib/franchises"
import type { Match, NearbyPlaces as Answer, NearbyPlace, RequestStatus } from "../types"
import { Icon } from "./Icon"
import { PlaceMap, placeState, placeStateLabels } from "./PlaceMap"
import { ProposalControl } from "./ProposalControl"
import { TabBar } from "./TabBar"

// 모든 종류를 한 번에 보여 준 뒤 종류별로 보여 준다.
const kinds = [{ code: "all", label: "전체" }, ...placeCategories]

type Partnering = {
  // 브랜드 카탈로그. 가입한 가게는 여기서 브랜드로 찾는다.
  brands: Match[]
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // 가게에 보내는 초대(InviteShopModal)를 연다. 보내졌으면 true.
  onInvite: (place: NearbyPlace) => Promise<boolean>
}

// 다른 탭의 은색 카드(WorkCard.tsx)와 같은 모양의 가게 하나. 맨 위에 종류와
// Kakao Map 페이지, 가운데에 브랜드나 체인의 로고 (없으면 이름의 첫 글자), 그
// 아래에 이름, 주소, 거리, 전화번호가 온다. uniconnect에 없는 가게는 파트너
// 카드라면 제안을 보여 줄 자리에 협약 전이라고 쓰고, 초대할 수 있다 (초대하면
// 초대함). 초대로 가입한 가게는 그 브랜드이며 상세 페이지와 제안이 있다.
// 방문자가 보는 가상의 가게에는 연결할 지도 페이지가 없다.
function PlaceCard({ place, partnering }: { place: NearbyPlace; partnering: Partnering }) {
  const brand = place.brandId ? partnering.brands.find((item) => item.id === place.brandId) : undefined
  const franchise = franchiseOf(place.name)
  const logo = franchise && franchiseLogos[franchise]
  const map = place.url ? { href: place.url, rel: "noopener noreferrer", target: "_blank" } : undefined
  const state = placeState(place)
  return (
    <article className="work-card">
      <div className="work-meta">
        <span>{place.category}</span>
        {map && (
          <a aria-label={t("{name} 카카오맵에서 보기", { name: place.name })} className="work-badge" {...map}>
            <Icon name="arrowUpRight" size={18} />
          </a>
        )}
      </div>

      <div aria-hidden="true" className="work-mark">
        {brand?.logo ? (
          <div className="match-logo large has-logo">
            <img alt="" src={brand.logo} />
          </div>
        ) : logo ? (
          <div className={logo.wide ? "match-logo large has-logo wordmark" : "match-logo large has-logo"}>
            <img alt="" src={logo.src} />
          </div>
        ) : (
          <div className="match-logo large monogram">{Array.from(place.name.trim())[0]}</div>
        )}
      </div>

      <div className="work-bottom">
        <div className="work-title">
          <div className="work-name">
            <h3>{map ? <a {...map}>{place.name}</a> : place.name}</h3>
            <p>{place.address}</p>
          </div>
        </div>
        <div className="work-tags">
          {state === "joined" && <span className="tag-joined">{t("uniconnect 가입")}</span>}
          <span className="tag-distance">
            <Icon name="pin" size={13} />
            <span className="sr-only">{t("거리")}</span>
            {formatDistance(place.distanceM / 1000)}
          </span>
          {place.phone && (
            <span>
              <a href={`tel:${place.phone}`}>{place.phone}</a>
            </span>
          )}
        </div>
        <div className="work-actions">
          {brand ? (
            <>
              <button className="cancel-button" onClick={() => partnering.onOpenDetail(brand)} type="button">
                {t("상세 정보")}
              </button>
              <ProposalControl
                className="primary-button"
                done={partnering.proposals.includes(brand.id)}
                label={t("협찬 제안하기")}
                onCancel={() => partnering.onCancelProposal(brand)}
                onPropose={() => partnering.onPropose(brand)}
                status={partnering.statuses[brand.id]}
              />
            </>
          ) : state === "joined" ? (
            <>
              {map && (
                <a className="cancel-button" {...map}>
                  {t("카카오맵에서 보기")}
                  <span className="sr-only">{t("(새 창)")}</span>
                </a>
              )}
              <span className="proposal-button unpartnered">{t("uniconnect 가입")}</span>
            </>
          ) : (
            <>
              <button
                aria-label={t(state === "invited" ? "{name} 초대장 다시 보기" : "{name} 초대하기", { name: place.name })}
                className="cancel-button"
                onClick={() => void partnering.onInvite(place)}
                type="button"
              >
                {t(state === "invited" ? "초대장 다시 보기" : "초대하기")}
              </button>
              <span className={state === "invited" ? "proposal-button unpartnered invited" : "proposal-button unpartnered"}>
                {t(placeStateLabels[state])}
              </span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}

// 학생단체 캠퍼스 주변의 실제 가게를 Kakao Local에서 실시간으로 가져온다.
// 종류는 칩으로 고르고(처음에는 전체), 위치를 말해 주는 한 줄과 목록·스케치
// 지도 전환이 있으며, 가까운 가게부터 다른 탭과 같은 카드로 보여 준다. Kakao는
// 결과 저장을 허용하지 않으므로 고를 때마다 서버에 새로 물어보고 답은 화면에만
// 둔다. 방문자에게는 데모 그룹의 캠퍼스 주변에 가상의 가게를 보여 주며, 문구로
// 그 사실을 알린다.
export function NearbyPlaces(partnering: Partnering) {
  const [category, setCategory] = useState(kinds[0].code)
  const [answer, setAnswer] = useState<{ category: string; result?: Answer; error?: string }>()
  const [layout, setLayout] = useState<"list" | "map">("list")
  // 지도 아래에 보여 줄 가게. 다른 가게를 누르기 전까지는 가장 가까운 곳이다.
  const [selected, setSelected] = useState<string>()

  useEffect(() => {
    let cancelled = false
    api.nearbyPlaces(category).then(
      (result) => {
        if (!cancelled) setAnswer({ category, result })
      },
      (error) => {
        if (!cancelled) setAnswer({ category, error: errorMessage(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [category])

  // 이전에 고른 종류의 답은 새 답을 불러오는 동안 반영하지 않는다.
  const current = answer?.category === category ? answer : undefined
  const result = current?.result
  const places = result?.places ?? []
  const note = !current
    ? t("학교 근처 가게를 찾고 있어요…")
    : current.error
      ? current.error
      : result?.example && result.campus
        ? t("{campus} 근처에 있다고 가정해 만든 예시 가게예요. 가까운 순서예요.", { campus: result.campus })
        : !result?.map
        ? t("지도 서비스가 연결되면 학교 근처 가게를 보여 드려요.")
        : !result.campus
          ? t("가입한 학교의 위치를 아직 몰라서 근처 가게를 찾을 수 없어요.")
          : places.length === 0
            ? t("{campus} 근처에서 찾은 가게가 없어요.", { campus: result.campus })
            : t("{campus} 근처, 가까운 순서예요.", { campus: result.campus })
  const shown = places.find((place) => place.id === selected) ?? places[0]

  // 초대를 보내면 Kakao에 다시 묻지 않고 그 가게에 바로 표시한다.
  const invite = async (place: NearbyPlace) => {
    if (!(await partnering.onInvite(place)) || !result) return false
    setAnswer({
      category,
      result: { ...result, places: places.map((item) => (item.id === place.id ? { ...item, invited: true } : item)) },
    })
    return true
  }
  const cards = { ...partnering, onInvite: invite }

  return (
    <div className="nearby-places">
      <TabBar
        chips
        items={kinds.map((item) => ({ value: item.code, label: t(item.label) }))}
        label={t("가게 종류")}
        onChange={(value, event) => {
          setCategory(value)
          setSelected(undefined)
          // 칩 행은 폰에서 옆으로 스크롤되므로 고른 칩이 보이게 한다.
          event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" })
        }}
        value={category}
      />
      <div className="nearby-head">
        <p aria-live="polite" className={current?.error ? "nearby-note error" : "nearby-note"}>
          {note}
        </p>
        {places.length > 0 && result?.center && (
          <div aria-label={t("보기 방식")} className="nearby-layout" role="group">
            {(["list", "map"] as const).map((item) => (
              <button aria-pressed={layout === item} key={item} onClick={() => setLayout(item)} type="button">
                {t(item === "list" ? "목록" : "지도")}
              </button>
            ))}
          </div>
        )}
      </div>
      {places.length > 0 && (
        <>
          {layout === "map" && result?.center && result.campus && shown ? (
            <div className="nearby-map">
              <PlaceMap
                campus={result.campus}
                center={result.center}
                onSelect={(place) => setSelected(place.id)}
                places={places}
                selected={shown.id}
              />
              <div aria-live="polite" className="nearby-map-card">
                <PlaceCard key={shown.id} partnering={cards} place={shown} />
              </div>
            </div>
          ) : (
            <ul className="work-grid stagger" key={category}>
              {places.map((place, index) => (
                <li key={place.id} style={{ "--i": index } as CSSProperties}>
                  <PlaceCard partnering={cards} place={place} />
                </li>
              ))}
            </ul>
          )}
          <p className="nearby-source">
            {result?.example
              ? t("예시로 만든 가게예요. 실제 가게나 카카오의 정보가 아니에요.")
              : t("정보 제공: 카카오 · 가게 로고는 각 회사의 상표이고 표시가 제휴를 뜻하지는 않아요.")}
          </p>
        </>
      )}
    </div>
  )
}
