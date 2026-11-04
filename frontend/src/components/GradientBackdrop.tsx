import { Component, lazy, Suspense, type ReactNode } from "react"

import { liteScenes } from "../lib/lite"

// three.js와 셰이더는 배경을 보여 주는 페이지에서만 내려받는다.
const GradientScene = lazy(() => import("./GradientScene"))

// has-gradient 클래스가 붙은 배너 뒤에서 움직이는 ShaderGradient
// (github.com/ruucm/shadergradient). 배너는 CSS 배경을 유지한다. 이 배경은
// 캔버스가 나타나기 전까지 보이고, 브라우저에 WebGL이 없으면 계속 보인다.
export function GradientBackdrop() {
  // 라이트 모드(lib/lite.ts)에서는 배너의 CSS 배경을 그대로 둔다.
  if (liteScenes()) return null
  return (
    <div aria-hidden="true" className="gradient-backdrop">
      <SceneBoundary>
        <Suspense fallback={null}>
          <GradientScene />
        </Suspense>
      </SceneBoundary>
    </div>
  )
}

// WebGL이 없는 등으로 장면이 실패하면 CSS 배경을 남긴다.
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
