import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import { t } from "../i18n"
import type { SavedSearch } from "../types"
import { Icon } from "./Icon"

// 서버에 저장하는 조건(backend lib/savedSearches.ts, #338). 지역 · 규모 · 시기 필터는
// 브라우저에서만 돌아서 저장하지 않는다. kind와 school은 단체 목록에만 있다.
export type SearchCriteria = { query: string; industry: string; kind?: string; school?: string }

// 카탈로그의 관심 조건: 지금 조건을 저장하고(5개까지), 저장한 조건을 눌러 다시 걸며,
// 저장한 뒤 새로 맞은 상대의 수를 보여 준다. 새 상대는 메일(주간 추천 요약과 같은 종류)로도
// 간다. 회원만 쓰고, 데모 계정과 방문자에게는 보이지 않는다.
export function SavedSearches({
  criteria,
  industryLabel,
  onApply,
  onNotice,
}: {
  criteria: SearchCriteria
  industryLabel: (industry: string) => string
  onApply: (criteria: SearchCriteria) => void
  onNotice: (message: string) => void
}) {
  const [searches, setSearches] = useState<SavedSearch[]>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.savedSearches().then(
      (result) => {
        if (!cancelled) setSearches(result.searches)
      },
      () => {
        if (!cancelled) setSearches([])
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const body = {
    ...(criteria.query.trim() ? { query: criteria.query.trim() } : {}),
    ...(criteria.industry ? { industry: criteria.industry } : {}),
    ...(criteria.kind ? { kind: criteria.kind } : {}),
    ...(criteria.school ? { school: criteria.school } : {}),
  }
  const hasCriteria = Object.keys(body).length > 0
  const same = (search: SavedSearch) =>
    (search.query ?? "") === (body.query ?? "") &&
    (search.industry ?? "") === (body.industry ?? "") &&
    (search.kind ?? "") === (body.kind ?? "") &&
    (search.school ?? "") === (body.school ?? "")
  const saved = searches?.some(same)

  const describe = (search: SavedSearch) =>
    [
      search.query && `“${search.query}”`,
      search.industry && industryLabel(search.industry),
      search.kind && t(search.kind),
      search.school,
    ]
      .filter(Boolean)
      .join(" · ")

  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await work()
    } catch (problem) {
      onNotice(errorMessage(problem))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      const { search } = await api.saveSearch(body)
      setSearches((list) => [search, ...(list ?? [])])
      onNotice(t("관심 조건을 저장했어요. 맞는 새 상대가 생기면 알려 드려요."))
    })

  const open = (search: SavedSearch) => {
    onApply({ query: search.query ?? "", industry: search.industry ?? "", kind: search.kind, school: search.school })
    if (search.fresh.length)
      void run(async () => {
        const { search: read } = await api.readSavedSearch(search.id)
        setSearches((list) => (list ?? []).map((item) => (item.id === read.id ? read : item)))
      })
  }

  const remove = (search: SavedSearch) =>
    run(async () => {
      await api.deleteSavedSearch(search.id)
      setSearches((list) => (list ?? []).filter((item) => item.id !== search.id))
      onNotice(t("관심 조건을 지웠어요."))
    })

  if (!searches) return null
  if (!searches.length && !hasCriteria) return null

  return (
    <div className="saved-searches">
      {hasCriteria && !saved && (
        <button className="catalog-clear saved-search-save" disabled={busy || searches.length >= 5} onClick={() => void save()} type="button">
          <Icon name="bell" size={14} />
          {searches.length >= 5 ? t("관심 조건은 5개까지 저장해요") : t("이 조건 저장")}
        </button>
      )}
      {searches.length > 0 && (
        <ul aria-label={t("저장한 관심 조건")} className="saved-search-list">
          {searches.map((search) => (
            <li className={same(search) ? "active" : undefined} key={search.id}>
              <button
                aria-label={t("관심 조건 {name} 다시 걸기", { name: search.name || describe(search) })}
                onClick={() => open(search)}
                type="button"
              >
                <span>{search.name || describe(search)}</span>
                {search.fresh.length > 0 ? (
                  <em>{t("새 상대 {count}", { count: search.fresh.length })}</em>
                ) : (
                  <small>{t("{count}곳", { count: search.matchCount })}</small>
                )}
              </button>
              <button
                aria-label={t("관심 조건 {name} 지우기", { name: search.name || describe(search) })}
                className="saved-search-remove"
                disabled={busy}
                onClick={() => void remove(search)}
                type="button"
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
