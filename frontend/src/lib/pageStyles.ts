import { lazy, type ComponentType } from "react"

// 첫 화면(소개, 대시보드, 헤더 · 메뉴 · 푸터, 로그인 · 가입, 404)에 쓰지 않는
// 규칙은 pages.css에 있다. 첫 다운로드에서 빼서 첫 화면이 덜 기다리게 하고,
// 다른 페이지나 팝업을 처음 열 때 그 코드와 함께 불러온다.
let styles: Promise<unknown> | undefined
export const loadPageStyles = () => (styles ??= import("../pages.css"))

// React.lazy와 같되, 화면을 그리기 전에 pages.css가 와 있게 한다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => Promise.all([load(), loadPageStyles()]).then(([module]) => module))
}
