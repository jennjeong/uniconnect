import { useEffect, type RefObject } from "react"

const focusable = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ")

// Keeps the keyboard in a dialog while it is open (`active`): focus moves
// into it (to `initial`, else the dialog itself), Tab and Shift+Tab go round
// its own controls instead of the page behind, and when it closes focus goes
// back where it was, unless something else has taken it meanwhile.
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
      if (lost && previous?.isConnected) previous.focus()
    }
  }, [active, dialog, initial])
}
