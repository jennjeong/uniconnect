import { useThree } from "@react-three/fiber"
import { ShaderGradient, ShaderGradientCanvas, type GradientT } from "@shadergradient/react"

// 카피가 놓이는 왼쪽 위는 짙은 남색이고, 오른쪽 아래로 갈수록 밝은 파랑으로
// 열리며 물마루에는 은색이 얹힌다. 셰이더는 color2(왼쪽)를 color1(오른쪽)로
// 섞고 물결을 color3 쪽으로 끌어올린다. 골은 반대로 넘어가 파랑을 포인트
// 색(index.css의 --point) 쪽으로 깊게 만든다. 지정하지 않은 설정은 라이브러리의
// "halo" 프리셋을 따른다.
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

// 좁은 렌즈로 화면을 거의 평평하게 유지하고, 좁은 배너에서는 카메라를 뒤로 물려
// 모든 배너가 같은 범위의 그라디언트를 보여 주게 한다.
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

// GradientBackdrop이 지연 로딩한다. 라이브러리는 배너가 화면에 있는 동안에만
// 캔버스를 돌리고(lazyLoad), 동작 줄이기 설정에서는 멈춰 있다.
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
