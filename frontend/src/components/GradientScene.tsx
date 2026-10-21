import { useThree } from "@react-three/fiber"
import { ShaderGradient, ShaderGradientCanvas, type GradientT } from "@shadergradient/react"

// Deep navy at the top left where the copy sits, opening into a brighter
// blue toward the bottom right with silver on the crests. The shader blends
// color2 (left) into color1 (right) and lifts the waves toward color3; the
// troughs overshoot away from it, deepening the blue toward the point color
// (--point in index.css). Settings left out come from the library's "halo"
// preset.
const look: GradientT = {
  type: "plane",
  color1: "#2f5fc8",
  color2: "#0c1d4b",
  color3: "#c9d3e4",
  brightness: 1.2,
  grain: "off",
  uSpeed: 0.2,
  uStrength: 1.9,
  uDensity: 1.5,
  positionX: 0,
  rotationY: 0,
  rotationZ: 30,
  cPolarAngle: 90,
  cAzimuthAngle: 180,
}

// A narrow lens keeps the view nearly flat, and the camera backs off on
// narrow banners so every banner shows the same stretch of the gradient.
const fov = 15
const visibleWidth = 7

function Gradient() {
  const { width, height } = useThree((state) => state.size)
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const aspect = width / Math.max(height, 1)
  return (
    <ShaderGradient
      {...look}
      animate={still ? "off" : "on"}
      cDistance={visibleWidth / (2 * Math.tan((fov * Math.PI) / 360) * aspect)}
    />
  )
}

// Loaded lazily by GradientBackdrop. The library only runs the canvas while
// the banner is on screen (lazyLoad), and it holds still with reduced motion.
export default function GradientScene() {
  return (
    <ShaderGradientCanvas
      fov={fov}
      pixelDensity={1}
      pointerEvents="none"
      powerPreference="low-power"
      style={{ position: "absolute", inset: 0 }}
    >
      <Gradient />
    </ShaderGradientCanvas>
  )
}
