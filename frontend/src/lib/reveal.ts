// Stride's card reveal from getlayers.ai: anything marked data-reveal
// starts lowered, faded and blurred, and rises into place the first time it
// scrolls into view (index.css, "Motion"). A per-element delay can be set
// with style={{ "--reveal-delay": "0.2s" }}. Returns a function that stops it.
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
