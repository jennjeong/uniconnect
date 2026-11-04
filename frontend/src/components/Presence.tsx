import { createContext, useEffect, useState, type ReactNode } from "react"

// 팝업이 닫힘 애니메이션을 재생하는 동안 true (Modal.tsx가 읽는다).
export const ClosingContext = createContext(false)

// index.css의 닫힘 애니메이션과 맞춘다.
const exitMs = 260

// `show`가 false가 된 뒤에도 닫힘 애니메이션이 끝날 때까지 팝업을 화면에 둔다.
// 닫는 방법은 상관없다 (닫기 버튼, 배경, Escape, 로그인 완료).
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  // 마지막으로 보여 준 children. 닫히는 동안 다시 재생한다.
  const [kept, setKept] = useState<ReactNode>(show ? children : null)
  if (show && kept !== children) setKept(children)
  const closing = !show && kept !== null

  useEffect(() => {
    if (!closing) return
    const timer = window.setTimeout(() => setKept(null), exitMs)
    return () => window.clearTimeout(timer)
  }, [closing])

  return (
    <ClosingContext.Provider value={closing}>{show ? children : kept}</ClosingContext.Provider>
  )
}
