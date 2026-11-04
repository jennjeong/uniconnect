// getlayers.ai의 Stride 카드 리빌: data-reveal이 붙은 요소는 낮게 내려가고
// 흐려진 채로 시작해, 처음 화면에 들어올 때 제자리로 떠오른다 (index.css의
// "Motion"). 요소별 지연은 style={{ "--reveal-delay": "0.2s" }}로 줄 수 있다.
// 이를 멈추는 함수를 돌려준다.
export function installReveal() {
  const root = document.documentElement
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {}
  root.classList.add("reveal-ready")

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add("revealed")
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  )
  const watch = (node: Element) => {
    if (node.matches("[data-reveal]:not(.revealed)")) observer.observe(node)
    for (const child of node.querySelectorAll("[data-reveal]:not(.revealed)")) observer.observe(child)
  }
  watch(document.body)
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) if (node instanceof Element) watch(node)
    }
  })
  mutations.observe(document.body, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    mutations.disconnect()
    root.classList.remove("reveal-ready")
  }
}
