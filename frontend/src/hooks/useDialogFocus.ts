import { useEffect, type RefObject } from "react"

const focusable = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ")

// 대화창이 열려 있는 동안 키보드를 그 안에 붙잡아 둔다 (`active`). 포커스는
// 안으로 들어가고 (`initial`로, 없으면 대화창 자체로), Tab과 Shift+Tab은 뒤의
// 페이지 대신 대화창 안의 컨트롤을 돈다. 닫히면 포커스는 원래 있던 곳으로
// 돌아간다. 그사이 다른 것이 포커스를 가져갔다면 돌려주지 않는다.
export function useDialogFocus(
  dialog: RefObject<HTMLElement | null>,
  active: boolean,
  initial?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    ;(initial?.current ?? dialog.current)?.focus()

    const keepInside = (event: KeyboardEvent) => {
      const root = dialog.current
      if (event.key !== "Tab" || !root) return
      const items = [...root.querySelectorAll<HTMLElement>(focusable)].filter(
        (item) => item.getClientRects().length > 0,
      )
      if (items.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      if (!root.contains(current)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && (current === first || current === root)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", keepInside)
    return () => {
      document.removeEventListener("keydown", keepInside)
      const current = document.activeElement
      const lost = !current || current === document.body || dialog.current?.contains(current)
      if (lost && previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active, dialog, initial])
}
