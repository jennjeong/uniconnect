import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"

// Stride's chrome model scene from getlayers.ai ("Scene C"): a mirror-finish
// object turning slowly over a transparent canvas, falling through the frame
// as the page scrolls. Stride loads a chain and a heart from its own
// storage; these are built here instead — a chain of interlocking links
// (what keeps a sponsorship going) and two linked rings (two sides holding
// on to each other).

export type ChromeKind = "chain" | "rings"

// Stride's baked values, with the colour moved from lavender to silver.
const CHROME = { color: "#c1c8d6", metalness: 1, roughness: 0.1, envMapIntensity: 2.8, exposure: 0.95 }
const TILT_X = 0.22
const IDLE_SPIN = 0.004
const FRICTION = 0.965
const FALL_TOP = 9
const FALL_BOTTOM = -9
// The model is fitted to this many world units (Stride's 3.6); the chain
// runs longer, past the edges on phones.
const FIT: Record<ChromeKind, number> = { chain: 4.4, rings: 3.6 }

// A link's centreline: two straight runs joined by half circles.
class LinkCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private length: number,
    private radius: number,
  ) {
    super()
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const { length: l, radius: r } = this
    let d = t * (2 * l + 2 * Math.PI * r)
    if (d < l) return target.set(-l / 2 + d, r, 0)
    d -= l
    if (d < Math.PI * r) return target.set(l / 2 + r * Math.sin(d / r), r * Math.cos(d / r), 0)
    d -= Math.PI * r
    if (d < l) return target.set(l / 2 - d, -r, 0)
    d -= l
    return target.set(-l / 2 - r * Math.sin(d / r), -r * Math.cos(d / r), 0)
  }
}

function buildChain(material: THREE.Material) {
  const group = new THREE.Group()
  const geometry = new THREE.TubeGeometry(new LinkCurve(1, 0.5), 180, 0.16, 28, true)
  // Each link passes through the next one, turned a quarter.
  const links = 5
  const pitch = 1.55
  for (let i = 0; i < links; i++) {
    const link = new THREE.Mesh(geometry, material)
    link.position.x = (i - (links - 1) / 2) * pitch
    link.rotation.x = i % 2 ? Math.PI / 2 : 0
    group.add(link)
  }
  // Diagonal, so the chain crosses the frame instead of lying flat.
  group.rotation.z = 0.62
  return group
}

function buildRings(material: THREE.Material) {
  const group = new THREE.Group()
  const geometry = new THREE.TorusGeometry(1, 0.2, 40, 160)
  const left = new THREE.Mesh(geometry, material)
  left.position.x = -0.6
  const right = new THREE.Mesh(geometry, material)
  right.position.x = 0.6
  right.rotation.x = Math.PI / 2
  group.add(left, right)
  group.rotation.z = -0.35
  return group
}

export function createChrome(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  {
    kind,
    progress,
    scrollSpin = false,
    spinAccel = 0.00004,
    maxSpin = 0.045,
    spinDirection = 1,
  }: {
    kind: ChromeKind
    // 0 = above the frame, 0.5 = centred, 1 = below.
    progress: () => number
    scrollSpin?: boolean
    spinAccel?: number
    maxSpin?: number
    spinDirection?: 1 | -1
  },
) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = CHROME.exposure

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
  camera.position.set(0, 0, 8)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  const light = new THREE.DirectionalLight(0xffffff, 2.2)
  light.position.set(4, 6, 5)
  scene.add(light)

  const material = new THREE.MeshStandardMaterial({
    color: CHROME.color,
    metalness: CHROME.metalness,
    roughness: CHROME.roughness,
    envMapIntensity: CHROME.envMapIntensity,
  })
  const model = kind === "chain" ? buildChain(material) : buildRings(material)
  // Centre it on the origin and fit it, as Stride does with its models.
  const box = new THREE.Box3().setFromObject(model)
  const size = box.getSize(new THREE.Vector3())
  const fit = new THREE.Group()
  fit.add(model)
  model.position.sub(box.getCenter(new THREE.Vector3()))
  fit.scale.setScalar(FIT[kind] / Math.max(size.x, size.y, size.z))
  const spin = new THREE.Group()
  spin.add(fit)
  spin.rotation.x = TILT_X
  scene.add(spin)

  const resize = () => {
    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  let visible = true
  const visibility = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting
  })
  visibility.observe(container)

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  let spinVelocity = 0
  let lastScroll = window.scrollY
  let frame = 0
  const render = () => {
    const p = still ? 0.5 : Math.min(1, Math.max(0, progress()))
    spin.position.y = FALL_TOP + (FALL_BOTTOM - FALL_TOP) * p
    renderer.render(scene, camera)
  }
  const tick = () => {
    frame = requestAnimationFrame(tick)
    if (!visible || document.hidden) {
      lastScroll = window.scrollY
      return
    }
    if (scrollSpin) {
      spinVelocity = spinVelocity * FRICTION + (window.scrollY - lastScroll) * spinAccel
      spinVelocity = Math.max(-maxSpin, Math.min(maxSpin, spinVelocity))
      spin.rotation.y += spinDirection * (IDLE_SPIN + spinVelocity)
    } else {
      spin.rotation.y += spinDirection * IDLE_SPIN
    }
    lastScroll = window.scrollY
    render()
  }
  if (still) render()
  else frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    visibility.disconnect()
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
    })
    material.dispose()
    environment.dispose()
    pmrem.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
