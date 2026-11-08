import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"

import { nextTabIndex } from "../lib/tabKeys"

export type TabItem<T extends string> = { value: T; label: ReactNode }

// 강조 표시가 놓인 곳과 마지막으로 움직인 방향.
type Box = { left: number; right: number; top: number; height: number; toward: "left" | "right" }

// 탭이나 필터 칩의 한 줄. 강조 표시가 고른 항목으로 미끄러진다. 양 끝이 각자의
// 곡선으로 움직이고 앞쪽이 더 빨라서, 알약이 이동하는 동안 늘어났다가 도착하면
// 다시 줄어든다.
export function TabBar<T extends string>({
  items,
  value,
  onChange,
  label,
  chips = false,
}: {
  items: TabItem<T>[]
  value: T
  // 고른 값과 그 항목의 버튼(옆으로 스크롤되는 줄에서 보이게 할 때 쓴다).
  onChange: (value: T, button: HTMLButtonElement) => void
  // 행의 접근성 이름.
  label: string
  // 탭 대신 쓰는 필터 칩 (업종별, 분야별).
  chips?: boolean
}) {
  const row = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState<Box | null>(null)

  // 고른 항목을 측정하고, 행의 크기가 바뀌거나 줄이 바뀔 때 다시 측정한다.
  useLayoutEffect(() => {
    const element = row.current
    if (!element) return
    const measure = () => {
      const active = element.querySelector<HTMLElement>("[data-active='true']")
      if (!active) return
      const left = active.offsetLeft
      setHighlight((last) => ({
        left,
        right: element.clientWidth - left - active.offsetWidth,
        top: active.offsetTop,
        height: active.offsetHeight,
        toward: last && left < last.left ? "left" : last && left > last.left ? "right" : (last?.toward ?? "right"),
      }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [value, items.length])

  // 탭 줄은 Tab 키로 한 번만 들어오고(고른 탭), 그 안에서는 화살표 · Home · End로
  // 옮기며 바로 고른다. 필터 칩은 각자 눌리는 버튼이라 그대로 둔다.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (chips) return
    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")]
    const index = tabs.findIndex((tab) => tab === document.activeElement)
    if (index < 0) return
    const next = nextTabIndex(event.key, index, tabs.length)
    if (next === null) return
    event.preventDefault()
    tabs[next].focus()
    onChange(items[next].value, tabs[next])
  }

  return (
    <div
      aria-label={label}
      className={chips ? "industry-chips" : "match-tabs"}
      onKeyDown={onKeyDown}
      ref={row}
      role={chips ? undefined : "tablist"}
    >
      {highlight && (
        <span
          aria-hidden="true"
          className="tab-highlight"
          data-toward={highlight.toward}
          style={{ left: highlight.left, right: highlight.right, top: highlight.top, height: highlight.height }}
        />
      )}
      {items.map((item, index) => {
        const active = item.value === value
        // 고른 탭이 없으면 첫 탭이 Tab 키로 들어오는 자리다.
        const entry = active || (index === 0 && !items.some((other) => other.value === value))
        const name = chips ? "industry-chip" : "match-tab"
        return (
          <button
            aria-pressed={chips ? active : undefined}
            aria-selected={chips ? undefined : active}
            className={active ? `${name} active` : name}
            data-active={active}
            key={item.value}
            onClick={(event) => onChange(item.value, event.currentTarget)}
            role={chips ? undefined : "tab"}
            tabIndex={chips || entry ? undefined : -1}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
