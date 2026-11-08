import { useEffect, useState } from "react"

import type { HistoryEntry } from "../lib/route"

// 화면의 상태(탭, 검색어, 필터)를 히스토리 항목마다 기억한다. 상세로 갔다가 뒤로
// 돌아오면 그 항목의 상태로 다시 그려져, 스크롤 복원(lib/scroll.ts)이 같은 목록
// 위에서 일어난다. 새로 이동해 온 화면은 새 항목이라 처음 값에서 시작한다.
const store = new Map<string, unknown>()

const entryIndex = () => (history.state as HistoryEntry | null)?.index ?? 0

// 새 항목을 쌓으면 그 자리와 그 뒤의 옛 항목(앞으로 가기로 닿던 것)은 사라진다.
export function forgetEntriesFrom(index: number) {
  for (const key of store.keys()) {
    if (Number(key.split(":")[0]) >= index) store.delete(key)
  }
}

export function useEntryState<T>(key: string, initial: T) {
  const [slot] = useState(() => `${entryIndex()}:${key}`)
  const [value, setValue] = useState<T>(() => (store.has(slot) ? (store.get(slot) as T) : initial))
  useEffect(() => {
    store.set(slot, value)
  }, [slot, value])
  return [value, setValue] as const
}
