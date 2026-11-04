import { useEffect, type RefObject } from "react"

// 상단 바의 버튼에 매달린 패널을 닫는다. Escape나 패널과 그 버튼(버튼이 스스로
// 토글한다) 바깥을 누르면 닫힌다. 패널이 닫히는 애니메이션 중에는 아무것도 듣지
// 않는다.
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
