import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { franchiseLogos } from "../data/franchises"
import { placeCategories } from "../data/places"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import { franchiseOf } from "../lib/franchises"
import type { NearbyPlaces as Answer, NearbyPlace } from "../types"
import { Icon } from "./Icon"
import { TabBar } from "./TabBar"

// Every kind at once, then each kind on its own.
const kinds = [{ code: "all", label: "전체" }, ...placeCategories]

// One shop as the other tabs' silver card (WorkCard.tsx): its kind and its
// Kakao Map page at the top, its chain's logo (or its name's first letter) in
// the middle, then its name, address, distance and phone, and 협약 전 where a
// partner's card offers a proposal.
function PlaceCard({ place }: { place: NearbyPlace }) {
  const franchise = franchiseOf(place.name)
  const logo = franchise && franchiseLogos[franchise]
  const map = { href: place.url, rel: "noopener noreferrer", target: "_blank" }
  return (
    <article className="work-card">
      <div className="work-meta">
        <span>{place.category}</span>
        <a aria-label={t("{name} 카카오맵에서 보기", { name: place.name })} className="work-badge" {...map}>
          <Icon name="arrowUpRight" size={18} />
        </a>
      </div>

      <div aria-hidden="true" className="work-mark">
        {logo ? (
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
            <h3>
              <a {...map}>{place.name}</a>
            </h3>
            <p>{place.address}</p>
          </div>
        </div>
        <div className="work-tags">
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
          <a className="cancel-button" {...map}>
            {t("카카오맵에서 보기")}
            <span className="sr-only">{t("(새 창)")}</span>
          </a>
          <span className="proposal-button unpartnered">{t("협약 전")}</span>
        </div>
      </div>
    </article>
  )
}

// Real shops around the student group's campus, live from Kakao Local: the
// kinds as chips (every kind at first), a line saying where, then the shops
// nearest first as cards like the other tabs', marked as not partnered yet.
// Kakao doesn't allow keeping its results, so each pick asks the server
// afresh and the answer lives only on screen.
export function NearbyPlaces() {
  const [category, setCategory] = useState(kinds[0].code)
  const [answer, setAnswer] = useState<{ category: string; result?: Answer; error?: string }>()

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
      : !result?.map
        ? t("지도 서비스가 연결되면 학교 근처 가게를 보여 드려요.")
        : !result.campus
          ? t("가입한 학교의 위치를 아직 몰라서 근처 가게를 찾을 수 없어요.")
          : places.length === 0
            ? t("{campus} 근처에서 찾은 가게가 없어요.", { campus: result.campus })
            : t("{campus} 근처, 가까운 순서예요.", { campus: result.campus })

  return (
    <div className="nearby-places">
      <TabBar
        chips
        items={kinds.map((item) => ({ value: item.code, label: t(item.label) }))}
        label={t("가게 종류")}
        onChange={(value, event) => {
          setCategory(value)
          // The chip row scrolls sideways on phones; keep the pick in view.
          event.currentTarget.scrollIntoView({ block: "nearest", inline: "center" })
        }}
        value={category}
      />
      <p aria-live="polite" className={current?.error ? "nearby-note error" : "nearby-note"}>
        {note}
      </p>
      {places.length > 0 && (
        <>
          <ul className="work-grid stagger" key={category}>
            {places.map((place, index) => (
              <li key={place.id} style={{ "--i": index } as CSSProperties}>
                <PlaceCard place={place} />
              </li>
            ))}
          </ul>
          <p className="nearby-source">
            {t("정보 제공: 카카오 · 가게 로고는 각 회사의 상표이고, 표시가 제휴를 뜻하지는 않아요.")}
          </p>
        </>
      )}
    </div>
  )
}
