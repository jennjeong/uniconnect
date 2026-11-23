import type { DismissedListing } from "../types"
import { t } from "../i18n"

// 관심 없음으로 추천에서 뺀 곳(#341). 추천 탭 아래에 접어 두고, 하나씩 되돌린다.
export function DismissedList({ items, onUndo }: { items: DismissedListing[]; onUndo: (listingId: string) => void }) {
  if (items.length === 0) return null
  return (
    <details className="dismissed-list">
      <summary>{t("추천에서 뺀 곳 {count}", { count: items.length })}</summary>
      <ul>
        {items.map((item) => (
          <li key={item.listingId}>
            <span>
              <b>{item.name}</b>
              <small>{t(item.reason)}</small>
            </span>
            <button
              aria-label={t("{name} 다시 추천받기", { name: item.name })}
              className="row-button"
              onClick={() => onUndo(item.listingId)}
              type="button"
            >
              {t("되돌리기")}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
