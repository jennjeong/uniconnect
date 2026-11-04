import { useEffect, useRef } from "react"

import { liteScenes } from "../lib/lite"
import type { GradientConfig } from "./shaders"

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const hexToVec3 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const
}

// CONFIG 키의 유니폼 이름. colorA → uColorA, bgColor → uBg.
const uniformName = (key: string) =>
  key === "bgColor" ? "uBg" : `u${key[0].toUpperCase()}${key.slice(1)}`

// getlayers.ai의 WebGL2 그라디언트들이 함께 쓰는 엔진 (scenes/shaders.ts). 전체
// 화면 삼각형 하나와 프래그먼트 셰이더 하나, CONFIG 키마다 하나씩의 유니폼,
// 커서를 따라가는 포인터 (빠른 선두를 더 느린 몸이 쫓는다), 프레임 시간을
// 제한해 만든 시계로 이루어진다. 숨은 탭은 점프가 아니라 멈춤으로 끝난다.
// 부모를 가득 채우며 화면에 있을 때만 그린다. 동작 줄이기 설정에서는 시계를
// 멈춘다. WebGL2가 없으면 부모의 배경이 보인다.
export function LayersGradient({
  shader,
  className,
}: {
  shader: { frag: string; config: GradientConfig }
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    // 라이트 모드(lib/lite.ts)에서는 부모의 CSS 배경을 그대로 둔다.
    if (!host || liteScenes()) return
    // 마운트할 때마다 새 캔버스를 쓴다. 캔버스는 평생 컨텍스트 하나만 가지는데,
    // 정리 단계에서 이 컨텍스트를 잃기 때문이다 (React는 개발 모드에서 두 번
    // 마운트한다).
    const canvas = document.createElement("canvas")
    host.append(canvas)
    const remove = () => canvas.remove()
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      failIfMajorPerformanceCaveat: true,
    })
    if (!gl) return remove

    const compile = (type: number, source: string) => {
      const compiled = gl.createShader(type)!
      gl.shaderSource(compiled, source)
      gl.compileShader(compiled)
      if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(compiled) ?? "")
      return compiled
    }
    const program = gl.createProgram()!
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, shader.frag))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return remove
    } catch {
      return remove
    }
    gl.useProgram(program)
    gl.bindVertexArray(gl.createVertexArray())

    const locations = new Map<string, WebGLUniformLocation | null>()
    const loc = (name: string) => {
      if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name))
      return locations.get(name) ?? null
    }
    const maxDpr = Number(shader.config.maxDpr ?? 1)
    for (const [key, value] of Object.entries(shader.config)) {
      if (key === "maxDpr") continue
      if (typeof value === "string") gl.uniform3f(loc(uniformName(key)), ...hexToVec3(value))
      else gl.uniform1f(loc(uniformName(key)), value)
    }

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.uniform2f(loc("iResolution"), width, height)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    // 포인터는 추적하지 않고 느낌만 준다. 빠른 선두를 더 느린 몸이 쫓는다.
    const mouse = { x: 0, y: 0, ax: 0, ay: 0, tx: 0, ty: 0 }
    const aim = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect()
      const aspect = box.width / Math.max(box.height, 1)
      mouse.tx = ((event.clientX - box.left) / box.width - 0.5) * aspect
      mouse.ty = 0.5 - (event.clientY - box.top) / box.height
    }
    window.addEventListener("pointermove", aim, { passive: true })
    window.addEventListener("pointerdown", aim, { passive: true })

    let visible = true
    const visibility = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting
    })
    visibility.observe(canvas)

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let prev = performance.now()
    let clock = 0
    let frame = 0
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw)
      const raw = now - prev
      prev = now
      if (!visible || document.hidden) return
      const ms = raw > 50 ? 50 : raw < 4.167 ? 4.167 : raw
      const s = ms > 36.7 ? 2.2 : ms * 0.06
      if (!still) clock += ms * 0.001
      const kLead = 0.105 * s
      const kBody = 0.043 * s
      mouse.ax += (mouse.tx - mouse.ax) * kLead
      mouse.ay += (mouse.ty - mouse.ay) * kLead
      mouse.x += (mouse.ax - mouse.x) * kBody
      mouse.y += (mouse.ay - mouse.y) * kBody
      gl.uniform1f(loc("iTime"), clock)
      gl.uniform2f(loc("iMouse"), mouse.x, mouse.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    // 드러나기 전에 한 번 그려서 빈 캔버스 위로 페이드되지 않게 한다.
    gl.uniform1f(loc("iTime"), 0)
    gl.uniform2f(loc("iMouse"), 0, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      visibility.disconnect()
      window.removeEventListener("pointermove", aim)
      window.removeEventListener("pointerdown", aim)
      gl.getExtension("WEBGL_lose_context")?.loseContext()
      remove()
    }
  }, [shader])

  return <div aria-hidden="true" className={className ? `layers-gradient ${className}` : "layers-gradient"} ref={hostRef} />
}
