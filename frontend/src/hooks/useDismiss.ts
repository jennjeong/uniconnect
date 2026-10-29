import { useEffect, type RefObject } from "react"

// Closes a panel that hangs from a button in the top bar: on Escape, or on a
// press anywhere outside the panel and its button (which toggles it itself).
// Nothing listens while the panel is animating closed.
export function useDismiss(
  panelRef: RefObject<HTMLElement | null>,
  toggleRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  closing: boolean,
) {
  useEffect(() => {
    if (closing) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panelRef.current?.contains(target) && !toggleRef.current?.contains(target)) onClose()
    }
    window.addEventListener("keydown", closeOnEscape)
    document.addEventListener("pointerdown", closeOutside)
    return () => {
      window.removeEventListener("keydown", closeOnEscape)
      document.removeEventListener("pointerdown", closeOutside)
    }
  }, [closing, onClose, panelRef, toggleRef])
}
