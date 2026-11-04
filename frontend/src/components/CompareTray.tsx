import { useState, type ReactNode } from "react"

import { t } from "../i18n"
import { formatDay } from "../lib/date"
import { formatDistance } from "../lib/distance"
import { BrandMark } from "./BrandMark"
import { Icon } from "./Icon"
import { Modal } from "./Modal"
import { Presence } from "./Presence"
import type { Match } from "../types"

// 비교 한 번에 나란히 놓을 수 있는 최대 개수.
export const maxCompared = 3

// 카탈로그 페이지에서 비교하려고 고른 카드의 id. 최대 maxCompared개.
export function useCompare() {
  const [ids, setIds] = useState<string[]>([])
  return {
    ids,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) =>
      setIds((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : current.length < maxCompared ? [...current, id] : current,
      ),
    remove: (id: string) => setIds((current) => current.filter((item) => item !== id)),
    clear: () => setIds([]),
  }
}

const percentOf = (value: number) => `${Math.round(value * 100)}%`

// 비교: 고른 브랜드나 그룹을 페이지 아래쪽에 모아 두고, 둘 이상이면 나란히 놓은
// 표를 보여 준다. 매치와 그 세부, 거리, 리뷰, 각자 제안하는 것, 그룹이면 다음
// 행사가 들어간다.
export function CompareTray({
  items,
  kind,
  onRemove,
  onClear,
  onOpenDetail,
}: {
  items: Match[]
  kind: "brand" | "group"
  onRemove: (id: string) => void
  onClear: () => void
  onOpenDetail: (match: Match) => void
}) {
  const [open, setOpen] = useState(false)
  const shown = open && items.length >= 2
  const parts = [...new Set(items.flatMap((item) => (item.scoreParts ?? []).map((part) => part.label)))]
  const row = (label: string, cell: (item: Match) => ReactNode) => (
    <tr key={label}>
      <th scope="row">{label}</th>
      {items.map((item) => (
        <td key={item.id}>{cell(item)}</td>
      ))}
    </tr>
  )
  // 숫자 행에서는 가장 좋은 값을 강조한다.
  const best = (value: (item: Match) => number | undefined, lowest = false) => {
    const values = items.map(value).filter((item): item is number => item !== undefined)
    return values.length > 1 ? (lowest ? Math.min(...values) : Math.max(...values)) : undefined
  }
  const topScore = best((item) => item.score)
  const nearest = best((item) => item.distanceKm, true)
  const topRating = best((item) => (item.reviewCount ? item.rating : undefined))

  if (items.length === 0) return null
  return (
    <>
      <div aria-label={t("비교함")} className="compare-tray" role="region">
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <button aria-label={t("{name} 비교에서 빼기", { name: item.name })} onClick={() => onRemove(item.id)} type="button">
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
        <small>{items.length < 2 ? t("하나 더 담으면 비교할 수 있어요.") : t("{max}곳까지 담을 수 있어요.", { max: maxCompared })}</small>
        <button className="underline-link" onClick={onClear} type="button">
          {t("비우기")}
        </button>
        <button className="primary-button" disabled={items.length < 2} onClick={() => setOpen(true)} type="button">
          {t("나란히 비교하기")}
        </button>
      </div>
      <Presence show={shown}>
        <Modal
          kicker="Compare"
          name="compare"
          onClose={() => setOpen(false)}
          title={kind === "brand" ? t("브랜드 {count}곳 비교", { count: items.length }) : t("학생단체 {count}곳 비교", { count: items.length })}
        >
          <div aria-label={t("비교표")} className="compare-scroll" role="region" tabIndex={0}>
            <table className="compare-table">
              <thead>
                <tr>
                  <td />
                  {items.map((item) => (
                    <th key={item.id} scope="col">
                      <BrandMark match={item} />
                      <span>{item.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row(t("일치율"), (item) => <b className={item.score === topScore ? "best" : undefined}>{item.score}%</b>)}
                {parts.map((label) =>
                  row(t(label), (item) => {
                    const part = item.scoreParts?.find((entry) => entry.label === label)
                    return part ? (
                      <span className="compare-bar">
                        <i style={{ width: percentOf(part.value) }} />
                        <small>{percentOf(part.value)}</small>
                      </span>
                    ) : (
                      "—"
                    )
                  }),
                )}
                {row(t("거리"), (item) =>
                  item.distanceKm === undefined ? "—" : (
                    <span className={item.distanceKm === nearest ? "best" : undefined}>{formatDistance(item.distanceKm)}</span>
                  ),
                )}
                {row(t("파트너 후기"), (item) =>
                  item.reviewCount ? (
                    <span className={item.rating === topRating ? "best" : undefined}>
                      ★ {item.rating?.toFixed(1)} · {t("후기 {count}", { count: item.reviewCount })}
                    </span>
                  ) : (
                    t("아직 없어요")
                  ),
                )}
                {row(kind === "brand" ? t("업종") : t("분야"), (item) => t(item.category))}
                {kind === "group"
                  ? row(t("학교"), (item) => item.school ?? "—")
                  : row(t("매장"), (item) => item.location?.address ?? "—")}
                {kind === "group" &&
                  row(t("다음 행사"), (item) =>
                    item.eventName ? `${item.eventName}${item.eventDate ? ` · ${formatDay(item.eventDate)}` : ""}` : "—",
                  )}
                {kind === "group" && row(t("예상 인원"), (item) => (item.audience ? t("{count}명", { count: item.audience }) : "—"))}
                {row(kind === "brand" ? t("제공하는 협찬") : t("내세우는 점"), (item) => item.offer || "—")}
                {kind === "brand" && row(t("사업자 확인"), (item) => (item.businessVerified ? t("확인됨") : "—"))}
                {row(t("태그"), (item) => item.tags.slice(0, 4).join(", ") || "—")}
                <tr>
                  <td />
                  {items.map((item) => (
                    <td key={item.id}>
                      <button
                        className="cancel-button"
                        onClick={() => {
                          setOpen(false)
                          onOpenDetail(item)
                        }}
                        type="button"
                      >
                        {t("상세 보기")}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Modal>
      </Presence>
    </>
  )
}
