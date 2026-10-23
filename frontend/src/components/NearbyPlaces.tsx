import { useEffect, useState, type CSSProperties } from "react"

import { api, errorMessage } from "../api"
import { placeCategories } from "../data/places"
import { t } from "../i18n"
import { formatDistance } from "../lib/distance"
import type { NearbyPlaces as Answer } from "../types"
import { Icon } from "./Icon"
import { TabBar } from "./TabBar"

// Real shops around the student group's campus, live from Kakao Local: the
// kinds as chips, a line saying where, then the shops nearest first with
// their Kakao Map page and phone, since they aren't on uniconnect. Kakao
// doesn't allow keeping its results, so each pick asks the server afresh and
// the answer lives only on screen.
export function NearbyPlaces() {
  const [category, setCategory] = useState(placeCategories[0].code)
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
        items={placeCategories.map((item) => ({ value: item.code, label: t(item.label) }))}
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
          <ul className="place-list stagger" key={category}>
            {places.map((place, index) => (
              <li key={place.id} style={{ "--i": index } as CSSProperties}>
                <article className="place-card">
                  <span className="place-kind">{place.category}</span>
                  <h3>{place.name}</h3>
                  <p className="place-address">{place.address}</p>
                  <div className="place-facts">
                    <span className="place-distance">
                      <Icon name="pin" size={13} />
                      <span className="sr-only">{t("거리")}</span>
                      {formatDistance(place.distanceM / 1000)}
                    </span>
                    {place.phone && <a href={`tel:${place.phone}`}>{place.phone}</a>}
                  </div>
                  <a className="place-link" href={place.url} rel="noopener noreferrer" target="_blank">
                    {t("카카오맵에서 보기")}
                    <span className="sr-only">{t("(새 창)")}</span>
                    <Icon name="arrowUpRight" size={15} />
                  </a>
                </article>
              </li>
            ))}
          </ul>
          <p className="nearby-source">{t("정보 제공: 카카오")}</p>
        </>
      )}
    </div>
  )
}
