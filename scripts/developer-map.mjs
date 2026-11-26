// 개발자용 구조 지도(/developers/map.html)를 만든다.
// floorplan(MIT, github.com/haydenschmitty/floorplan)이 내보낸 한 파일짜리 지도를 받아
//  - 페이지 안의 스크립트를 파일로 떼어 사이트의 Content-Security-Policy(script-src 'self') 안에서 돌게 하고,
//  - 사이트의 색과 Pretendard 글꼴을 덧입히는 theme.css를 붙이고,
//  - 이 사이트에서 쓰지 않는 기능(질문 창, 대기자 카드)과 그 안내 문구를 덜어 낸다.
// 지도의 구조와 배치는 그대로 둔다. 점검 결과(health)가 없는 사본을 넣는다.
//   node floorplan/serve.mjs --export floorplan/uniconnect-map.html
//   node scripts/developer-map.mjs floorplan/uniconnect-map.html
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const source = process.argv[2] ?? "floorplan/uniconnect-map.html"
const out = "frontend/public/developers"
let html = readFileSync(source, "utf8")

if (/"health"\s*:\s*\{/.test(html) && /"include":\[[^\]]*"health"/.test(html)) throw new Error("점검 결과가 든 사본이에요. health 없이 다시 내보내 주세요.")

// 사본 자체의 정책(스크립트마다 해시)은 떼어 낸 스크립트와 맞지 않으므로 빼고, 사이트의 정책을 따른다.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/g, "")

// 다른 도구 이름은 지도에 쓰이지 않는 질문 기능의 안내에만 나온다. 일반적인 말로 바꾼다.
const neutral = [
  [/https:\/\/docs\.claude\.com\/en\/docs\/claude-code\//g, "https://github.com/haydenschmitty/floorplan"],
  [/https:\/\/developers\.openai\.com\/codex/g, "https://github.com/haydenschmitty/floorplan"],
  [/Claude Code/g, "AI"],
  [/Claude/g, "AI"],
  [/Codex/g, "AI"],
  [/claude/g, "agenta"],
  [/codex/g, "agentb"],
]

mkdirSync(out, { recursive: true })
for (const name of readdirSync(out)) if (/^map-\d+\.js$/.test(name)) rmSync(path.join(out, name))

let index = 0
html = html.replace(/<script>([\s\S]*?)<\/script>/g, (_whole, body) => {
  // 대기자 카드는 floorplan 자체 서버에서만 뜨지만, 이 사이트에는 필요 없으니 아예 넣지 않는다.
  if (body.startsWith("/* ui/50-cloud.js */")) return ""
  let code = body
  for (const [pattern, word] of neutral) code = code.replace(pattern, word)
  index += 1
  const name = `map-${index}.js`
  writeFileSync(path.join(out, name), code)
  return `<script src="${name}"></script>`
})
for (const [pattern, word] of neutral) html = html.replace(pattern, word)

const notice = `<!-- uniconnect 개발자용 구조 지도. floorplan(MIT)이 그린 지도에 사이트의 색을 입혔다. 라이선스: LICENSES.txt -->\n`
html = html.replace(/<\/head>/, `<link rel="stylesheet" href="theme.css">\n</head>`)
html = html.replace(/<html/, `${notice}<html`).replace(/<title>[^<]*<\/title>/, "<title>uniconnect 구조 지도</title>")
writeFileSync(path.join(out, "map.html"), html)

// Pretendard(SIL OFL)는 사이트와 같은 파일을 쓴다.
const require = createRequire(path.resolve("frontend/package.json"))
const pretendard = path.dirname(require.resolve("pretendard/package.json"))
mkdirSync(path.join(out, "fonts"), { recursive: true })
copyFileSync(path.join(pretendard, "dist/web/variable/woff2/PretendardVariable.woff2"), path.join(out, "fonts/PretendardVariable.woff2"))

if (/claude|codex|anthropic/i.test(readdirSync(out).filter((name) => /\.(js|html)$/.test(name)).map((name) => readFileSync(path.join(out, name), "utf8")).join(""))) {
  throw new Error("다른 도구 이름이 남았어요.")
}
console.log(`${out}/map.html: 스크립트 ${index}개`)
