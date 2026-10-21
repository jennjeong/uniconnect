import { Component, lazy, Suspense, type ReactNode } from "react"

// three.js and the shader download only when a page shows a backdrop.
const GradientScene = lazy(() => import("./GradientScene"))

// A moving ShaderGradient (github.com/ruucm/shadergradient) behind a banner
// with the has-gradient class. The banner keeps its CSS background, which
// shows until the canvas fades in and stays when the browser has no WebGL.
export function GradientBackdrop() {
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

// Leaves the CSS background when the scene fails, e.g. without WebGL.
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
