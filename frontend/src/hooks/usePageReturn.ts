import { useEffect } from "react"

// 다른 사이트에서 뒤로 왔을 때 브라우저가 페이지를 떠날 때 그대로 되살리면
// (뒤로/앞으로 캐시) 실행된다. 다시 불러오지 않으므로 떠날 때 잡아 둔 상태,
// 예를 들어 이동을 기다리는 팝업을 풀어야 한다.
export function usePageReturn(onReturn: () => void) {
  useEffect(() => {
    const returned = (event: PageTransitionEvent) => {
      if (event.persisted) onReturn()
    }
    window.addEventListener("pageshow", returned)
    return () => window.removeEventListener("pageshow", returned)
  }, [onReturn])
}
