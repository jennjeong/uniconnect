import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"

export type TabItem<T extends string> = { value: T; label: ReactNode }

type Box = { x: number; y: number; width: number; height: number }

// A row of tabs, or of filter chips, whose highlight slides to the picked one.
export function TabBar<T extends string>({
  items,
  value,
  onChange,
  label,
  chips = false,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (value: T, event: MouseEvent<HTMLButtonElement>) => void
  // Accessible name of the row.
  label: string
  // Filter chips (업종별, 분야별) instead of tabs.
  chips?: boolean
}) {
  const row = useRef<HTMLDivElement>(null)
  const [highlight, setHighlight] = useState<Box | null>(null)

  // Measures the picked item, and again when the row resizes or wraps.
  useLayoutEffect(() => {
    const element = row.current
    if (!element) return
    const measure = () => {
      const active = element.querySelector<HTMLElement>("[data-active='true']")
      if (!active) return
      setHighlight({
        x: active.offsetLeft,
        y: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [value, items.length])

  return (
    <div
      aria-label={label}
      className={chips ? "industry-chips" : "match-tabs"}
      ref={row}
      role={chips ? undefined : "tablist"}
    >
      {highlight && (
        <span
          aria-hidden="true"
          className="tab-highlight"
          style={{
            width: highlight.width,
            height: highlight.height,
            transform: `translate(${highlight.x}px, ${highlight.y}px)`,
          }}
        />
      )}
      {items.map((item) => {
        const active = item.value === value
        const name = chips ? "industry-chip" : "match-tab"
        return (
          <button
            aria-pressed={chips ? active : undefined}
            aria-selected={chips ? undefined : active}
            className={active ? `${name} active` : name}
            data-active={active}
            key={item.value}
            onClick={(event) => onChange(item.value, event)}
            role={chips ? undefined : "tab"}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
