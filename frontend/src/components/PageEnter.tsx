import { useEffect, useState, type HTMLAttributes } from "react"

let entered = false

// 페이지의 래퍼(.page-enter). 페이지가 바뀔 때마다 App이 새 key를 주어 등장 효과를
// 다시 재생하지만, 사이트를 연 첫 화면은 효과 없이 바로 보인다. 첫 화면이 0.45초
// 투명하게 시작하면 가장 큰 글(LCP)이 그만큼 늦게 그려지기 때문이다. 처음인지는
// 마운트할 때 한 번 정해서, 나중에 클래스가 바뀌어 효과가 다시 시작되지 않게 한다.
export function PageEnter({ fromHistory, ...props }: HTMLAttributes<HTMLDivElement> & { fromHistory: boolean }) {
  const [first] = useState(() => !entered)
  useEffect(() => {
    entered = true
  }, [])
  const className = ["page-enter", fromHistory && "from-history", first && "first-view"].filter(Boolean).join(" ")
  return <div {...props} className={className} />
}
