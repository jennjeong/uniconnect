// 사이트맵 페이지마다 따로 내보내는 HTML(dist/seo/<이름>.html). 모든 주소가 같은
// index.html을 받으면 JS를 돌리지 않는 수집기(네이버 일부, 카카오톡 · SNS 미리보기)에게
// 모든 페이지가 사이트 소개 하나로 보인다. 그래서 빌드가 사이트맵의 경로마다 index.html을
// 복사해 그 화면의 제목, 설명, canonical, og:url을 넣는다(vite.config.ts). 서버는 그 경로에
// 이 파일을 준다: Vercel은 vercel.json의 rewrites로, Express는 app.ts의 마지막 핸들러로.
// 앱은 그대로 같은 스크립트로 뜨고, 화면을 옮기면 applyPageMeta가 이어서 고친다.

import { pageMeta, siteAddress } from "./pageMeta"
import { readView, roleOfPage } from "./route"

// /faq → "faq". 한 단계짜리 경로만 파일이 된다. /는 index.html이 맡는다.
export function pageFileName(path: string) {
  return /^\/([a-z]+(?:-[a-z]+)*)$/.exec(path)?.[1]
}

const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const escapeAttr = (text: string) => escapeText(text).replace(/"/g, "&quot;")

// index.html의 제목과 설명을 바꾸고 canonical과 og:url을 더한다. 바꿀 태그가 없으면
// 더하고, 있으면 그 하나만 고친다.
export function pageDocument(html: string, meta: { title: string; description: string; url: string }) {
  const setMeta = (doc: string, key: "name" | "property", name: string, content: string) => {
    const tag = `<meta ${key}="${name}" content="${escapeAttr(content)}">`
    const pattern = new RegExp(`<meta ${key}="${name}" content="[^"]*"\\s*/?>`)
    return pattern.test(doc) ? doc.replace(pattern, () => tag) : doc.replace("</head>", () => `  ${tag}\n  </head>`)
  }
  let doc = html.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeText(meta.title)}</title>`)
  doc = setMeta(doc, "name", "description", meta.description)
  doc = setMeta(doc, "property", "og:title", meta.title)
  doc = setMeta(doc, "property", "og:description", meta.description)
  doc = setMeta(doc, "property", "og:url", meta.url)
  const canonical = `<link rel="canonical" href="${escapeAttr(meta.url)}">`
  return /<link rel="canonical"[^>]*>/.test(doc)
    ? doc.replace(/<link rel="canonical"[^>]*>/, () => canonical)
    : doc.replace("</head>", () => `  ${canonical}\n  </head>`)
}

// 사이트맵의 경로마다 [파일 이름, 그 HTML]. 사이트 주소가 없으면 만들지 않는다.
export function pageDocuments(html: string, paths: string[], siteUrl: string | undefined) {
  const documents: [string, string][] = []
  if (!siteUrl) return documents
  for (const path of paths) {
    const name = pageFileName(path)
    const url = siteAddress(path, siteUrl)
    if (!name || !url) continue
    const view = readView(new URL(path, "http://localhost") as unknown as Location)
    const meta = pageMeta(view, { role: roleOfPage(view.page) ?? "학생단체", page: view.page })
    documents.push([name, pageDocument(html, { ...meta, url })])
  }
  return documents
}
