// 개발자용 구조 지도(/developers)가 보여 줄 데이터를 만든다.
// 코드 구조를 읽은 floorplan/graph.json(git에 올리지 않는 로컬 결과)에서 파트, 파일, 서버 창구,
// 파트 사이의 연결, 대표 흐름만 골라 frontend/src/data/developerMap.json으로 쓴다.
// 점검 결과(health)는 넣지 않는다. 코드를 크게 바꾼 뒤 지도를 새로 만들고 다시 돌린다.
//   node scripts/developer-map.mjs [graph.json 경로]
import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const source = process.argv[2] ?? "floorplan/graph.json"
const out = "frontend/src/data/developerMap.json"
const graph = JSON.parse(readFileSync(source, "utf8"))

const nodes = graph.nodes.map((node) => ({
  id: node.id,
  parent: node.parent ?? null,
  label: node.label,
  kind: node.kind,
  summary: node.summary ?? "",
  files: node.stats?.files ?? 0,
  loc: node.stats?.loc ?? 0,
}))
const known = new Set(nodes.map((node) => node.id))

// 파일이 속한 파트. 연결을 파트 단위로 묶는 데 쓴다.
const ownerOf = new Map(graph.files.map((file) => [file.p, file.n]))
const files = graph.files.map((file) => ({ p: file.p, n: file.n, name: file.name ?? "", d: file.d ?? "" }))
const routes = graph.routes.map((route) => ({
  m: route.m,
  p: route.p,
  n: ownerOf.get(route.f) ?? null,
  name: route.name ?? "",
  d: route.d ?? "",
}))

// 파트 사이의 연결: 가져다 쓰는 코드(import), 서버 요청(http), 그 밖의 연결(data, call)을 센다.
// 테스트는 모든 곳을 쓰므로 연결에서 뺀다.
const nodeOf = (ref) => (ref.startsWith("n:") ? ref.slice(2) : ownerOf.get(ref.slice(2)))
const counts = new Map()
for (const link of graph.links) {
  const from = nodeOf(link.a)
  const to = nodeOf(link.b)
  if (!from || !to || from === to || from === "tests" || to === "tests") continue
  if (!known.has(from) || !known.has(to)) continue
  const kind = link.k === "import" ? "import" : link.k === "http" ? "http" : "other"
  const key = `${from}\u0000${to}\u0000${kind}`
  counts.set(key, (counts.get(key) ?? 0) + (link.w ?? 1))
}
const links = [...counts].map(([key, weight]) => {
  const [from, to, kind] = key.split("\u0000")
  return { from, to, kind, weight }
})

const refNode = (ref) => (ref.startsWith("n:") ? ref.slice(2) : ownerOf.get(ref.slice(2)) ?? null)
const flows = graph.flows.map((flow) => ({
  id: flow.id,
  title: flow.title,
  steps: flow.steps.map((step) => ({ node: refNode(step.ref), note: step.note })),
}))

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()
const data = {
  commit,
  generatedAt: new Date().toISOString().slice(0, 10),
  summary: graph.project.summary,
  nodes,
  files,
  routes,
  links,
  flows,
}
writeFileSync(out, `${JSON.stringify(data)}\n`)
console.log(`${out}: 파트 ${nodes.length}, 파일 ${files.length}, 서버 창구 ${routes.length}, 연결 ${links.length}`)
