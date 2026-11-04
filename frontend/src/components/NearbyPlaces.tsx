import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { placeCategories } from "../data/places"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import type { Match, NearbyPlaces as Answer, NearbyPlace, RequestStatus } from "../types"
import { Icon } from "./Icon"
import { PlaceMap, placeState, placeStateLabels } from "./PlaceMap"
import { ProposalControl } from "./ProposalControl"
import { TabBar } from "./TabBar"

// Every kind at once, then each kind on its own.
const kinds = [{ code: "all", label: "전체" }, ...placeCategories]

type Partnering = {
  // The brand catalog, where a shop that joined is found as its brand.
  brands: Match[]
  proposals: string[]
  statuses: Partial<Record<string, RequestStatus>>
  onOpenDetail: (match: Match) => void
  onPropose: (match: Match) => void
  onCancelProposal: (match: Match) => void
  // Opens the invitation for a shop (InviteShopModal); true once it is sent.
  onInvite: (place: NearbyPlace) => Promise<boolean>
}

// One shop as the other tabs' silver card (WorkCard.tsx): its kind and its
// Kakao Map page at the top, its brand's logo (or its name's first letter)
// in the middle, then its name, address, distance and phone. A shop not on
// uniconnect says 협약 전 where a partner's card offers a proposal and
// can be invited (초대함 once it is); one that joined from an invitation is
// that brand, with its detail page and a proposal. The made-up shops visitors
// see have no map page to link.
function PlaceCard({ place, partnering }: { place: NearbyPlace; partnering: Partnering }) {
  const brand = place.brandId ? partnering.brands.find((item) => item.id === place.brandId) : undefined
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

// Real shops around the student group's campus, live from Kakao Local: the
// kinds as chips (every kind at first), a line saying where with a switch
// between the list and a sketch map, then the shops nearest first as cards
// like the other tabs'. Kakao doesn't allow keeping its results, so each pick
// asks the server afresh and the answer lives only on screen. Visitors get
// made-up shops around the demo group's campus, and the lines say so.
export function NearbyPlaces(partnering: Partnering) {
  const [category, setCategory] = useState(kinds[0].code)
  const [answer, setAnswer] = useState<{ category: string; result?: Answer; error?: string }>()
  const [layout, setLayout] = useState<"list" | "map">("list")
  // The shop shown under the map; the nearest until another is pressed.
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

  // An answer for an earlier pick doesn't count while the new one loads.
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

  // An invitation sent marks its shop at once, without asking Kakao again.
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
          // The chip row scrolls sideways on phones; keep the pick in view.
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
              : t("정보 제공: 카카오")}
          </p>
        </>
      )}
    </div>
  )
}
