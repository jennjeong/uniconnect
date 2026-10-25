import { MESH_FRAG } from "./shaders"

// Stride's mesh gradient never moves, so it is drawn once per size and
// colour into an image and used as a CSS background. One small WebGL
// context, made on first use, draws them all; nothing keeps running.

const VERT = `attribute vec2 position;
varying vec2 vUv;
void main(){ vUv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }`

// Draws at most this wide; the gradient is smooth enough to scale up.
const maxWidth = 960

let context: { canvas: HTMLCanvasElement; gl: WebGLRenderingContext; program: WebGLProgram } | null | undefined
const cache = new Map<string, Promise<string>>()

const hexToVec3 = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const
}

function setup() {
  if (context !== undefined) return context
  const canvas = document.createElement("canvas")
  // Drawn on the CPU (lib/lite.ts), even one image holds the page up.
  const gl = canvas.getContext("webgl", {
    preserveDrawingBuffer: true,
    antialias: false,
    failIfMajorPerformanceCaveat: true,
  })
  if (!gl) return (context = null)
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, MESH_FRAG))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return (context = null)
  gl.useProgram(program)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, "position")
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  return (context = { canvas, gl, program })
}

// An object URL of the gradient for a box of this size, or "" without WebGL.
export function meshGradient(
  width: number,
  height: number,
  { base, light, deep, seed }: { base: string; light: string; deep: string; seed: number },
) {
  const w = Math.max(64, Math.min(maxWidth, Math.round(width)))
  const h = Math.max(64, Math.round((w * height) / Math.max(width, 1)))
  const key = `${w}x${h}|${base}|${light}|${deep}|${seed}`
  const cached = cache.get(key)
  if (cached) return cached
  const made = new Promise<string>((resolve) => {
    const ready = setup()
    if (!ready) return resolve("")
    const { canvas, gl, program } = ready
    canvas.width = w
    canvas.height = h
    gl.viewport(0, 0, w, h)
    gl.uniform2f(gl.getUniformLocation(program, "uResolution"), w, h)
    gl.uniform3f(gl.getUniformLocation(program, "uBase"), ...hexToVec3(base))
    gl.uniform3f(gl.getUniformLocation(program, "uLight"), ...hexToVec3(light))
    gl.uniform3f(gl.getUniformLocation(program, "uDeep"), ...hexToVec3(deep))
    gl.uniform1f(gl.getUniformLocation(program, "uSeed"), seed)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : ""), "image/jpeg", 0.92)
  })
  cache.set(key, made)
  return made
}
