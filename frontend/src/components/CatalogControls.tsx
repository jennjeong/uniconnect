import { useId, useState, type ReactNode } from "react"

import { t, tc } from "../i18n"
import { type Layout, LayoutSwitch } from "./CatalogMap"
import { CatalogSearch } from "./CatalogSearch"
import { Icon } from "./Icon"
import { ScoreNote } from "./ScoreBadge"
import { TabBar } from "./TabBar"

export type SortOption<T extends string> = { value: T; label: string }

// 지금 걸린 조건 하나. 목록 위에 칩으로 보이고 ×로 바로 지운다.
export type ActiveCondition = { key: string; label: string; onClear: () => void }

// 카탈로그(브랜드 찾기, 학생단체 찾기)의 조작부. 역할이 다른 네 가지를 나눠 둔다.
// - 범위(scope): 무엇을 보는지(전체, 추천, 찜 …). 탭.
// - 검색: 이름 · 태그 같은 낱말.
// - 정렬과 필터: '조건' 버튼으로 펼치는 칸 안에. 휴대폰 첫 화면을 덜 차지한다.
// - 보기: 목록 · 지도.
// 걸린 조건은 결과 수 옆에 칩으로 보이고 하나씩 또는 한꺼번에 지운다.
export function CatalogControls<S extends string, O extends string>({
  scope,
  search,
  sort,
  filters,
  active,
  onClearAll,
  count,
  layout,
  scoreSide,
  extra,
}: {
  scope: { items: { value: S; label: string }[]; value: S; onChange: (value: S) => void; label: string }
  // 범위에 따라 검색 · 조건 · 보기가 없을 수 있다(학교 앞 가게).
  search?: { value: string; onChange: (value: string) => void; label: string; placeholder: string }
  sort?: { options: SortOption<O>[]; value: O; onChange: (value: O) => void }
  // 조건 칸의 필터들(라벨이 있는 select 등).
  filters?: ReactNode
  active: ActiveCondition[]
  onClearAll: () => void
  // 결과 수 문장. 아직 모를 때는 없다.
  count?: string
  layout?: { value: Layout; onChange: (layout: Layout) => void }
  scoreSide?: "학생단체" | "브랜드"
  // 결과 줄의 다른 도구(여러 곳에 제안 등). 조건이 아니라 행동이라 펼치지 않아도 보인다.
  extra?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const sortName = useId()
  const hasPanel = Boolean(sort || filters)
  return (
    <div className="catalog-controls">
      <TabBar items={scope.items} label={scope.label} onChange={(value) => scope.onChange(value)} value={scope.value} />
      {(search || hasPanel) && (
        <div className="catalog-controls-row">
          {search && (
            <CatalogSearch label={search.label} onChange={search.onChange} placeholder={search.placeholder} value={search.value} />
          )}
          {hasPanel && (
            <button
              aria-controls={panelId}
              aria-expanded={open}
              className="catalog-conditions-toggle"
              onClick={() => setOpen(!open)}
              type="button"
            >
              <Icon name="filter" size={16} />
              <span>{tc("catalog", "조건")}</span>
              {active.length > 0 && (
                <em aria-label={t("걸린 조건 {count}개", { count: active.length })}>{active.length}</em>
              )}
            </button>
          )}
        </div>
      )}
      {hasPanel && (
        <div className="catalog-conditions" hidden={!open} id={panelId}>
          {sort && (
            <fieldset className="sort-choice">
              <legend>{t("정렬")}</legend>
              {sort.options.map((option) => (
                <label key={option.value}>
                  <input
                    checked={sort.value === option.value}
                    name={sortName}
                    onChange={() => sort.onChange(option.value)}
                    type="radio"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          )}
          {filters && <div className="catalog-filter-fields">{filters}</div>}
        </div>
      )}
      <div className="catalog-result-line">
        {count && (
          <p aria-live="polite" className="catalog-count">
            {count}
          </p>
        )}
        {active.length > 0 && (
          <ul aria-label={t("걸린 조건")} className="condition-chips">
            {active.map((condition) => (
              <li key={condition.key}>
                <span>{condition.label}</span>
                <button
                  aria-label={t("{label} 조건 지우기", { label: condition.label })}
                  onClick={condition.onClear}
                  type="button"
                >
                  <Icon name="close" size={12} />
                </button>
              </li>
            ))}
            {active.length > 1 && (
              <li className="condition-clear-all">
                <button onClick={onClearAll} type="button">
                  {t("모두 지우기")}
                </button>
              </li>
            )}
          </ul>
        )}
        {extra}
        {layout && <LayoutSwitch onChange={layout.onChange} value={layout.value} />}
        {/* 펼친 설명은 이 줄 아래 전체 폭으로 내려간다(CSS의 order와 flex-basis). */}
        {scoreSide && <ScoreNote side={scoreSide} />}
      </div>
    </div>
  )
}
