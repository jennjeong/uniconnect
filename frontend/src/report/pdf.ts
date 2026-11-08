import type { jsPDF as JsPdf } from "jspdf"
import fontUrl from "pretendard/dist/public/variable/PretendardVariable.ttf?url"

// A4 크기의 페이지 요소를 하나의 PDF로 저장한다. 페이지마다 보이는 모습은 지금처럼
// 이미지로 넣고(차트 · 막대 · 색이 화면과 같게), 그 위에 같은 자리에 보이지 않는 글자
// 층을 얹는다. 그래서 PDF 보기 프로그램에서 한글을 검색하고 고르고 복사할 수 있다.
// 글꼴(한글이 든 Pretendard TTF)은 PDF를 만들 때만 받고, jsPDF가 쓴 글자만 넣는다.
// 글꼴을 받지 못하면 예전처럼 이미지만으로 만든다(PDF는 그대로 나온다).
// 라이브러리와 글꼴은 필요할 때 불러와서 메인 번들에 들어가지 않는다.
export async function exportPdf(pages: HTMLElement[], fileName: string) {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import("jspdf"), import("html-to-image")])
  await document.fonts.ready
  const [fontEmbedCSS, textFont] = await Promise.all([loadedFontCSS(), loadTextFont()])

  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  if (textFont) {
    pdf.addFileToVFS("Pretendard.ttf", textFont)
    pdf.addFont("Pretendard.ttf", "Pretendard", "normal")
  }
  for (const [index, page] of pages.entries()) {
    const image = await toJpeg(page, { backgroundColor: "#ffffff", fontEmbedCSS, pixelRatio: 2, quality: 0.92 })
    if (index > 0) pdf.addPage()
    pdf.addImage(image, "JPEG", 0, 0, 210, 297)
    if (textFont) addTextLayer(pdf, page)
  }
  pdf.save(fileName)
}

// 파일 이름: 무엇(성과 리포트 등) · 행사나 캠페인 이름 · 만든 날. 파일 이름에 쓸 수 없는
// 글자는 빼고, 너무 긴 이름은 줄인다.
export function pdfFileName(kind: string, name: string, day: string) {
  const clean = (text: string) =>
    text
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
      .trim()
  return `${["uniconnect", clean(kind), clean(name), day].filter(Boolean).join("-")}.pdf`
}

// 한글 글꼴 파일을 base64로. 실패하면 null(글자 층 없이 이미지로만 만든다).
async function loadTextFont() {
  try {
    const response = await fetch(fontUrl)
    if (!response.ok) return null
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ""
    for (let start = 0; start < bytes.length; start += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
    }
    return btoa(binary)
  } catch (error) {
    console.warn("[pdf] 글꼴을 받지 못해 글자 층 없이 만들어요", error)
    return null
  }
}

// 페이지의 글자를 줄마다 같은 자리에 보이지 않게 쓴다. 화면 픽셀을 A4의 mm로 옮긴다.
function addTextLayer(pdf: JsPdf, page: HTMLElement) {
  const box = page.getBoundingClientRect()
  if (box.width === 0) return
  const mm = 210 / box.width
  pdf.setFont("Pretendard", "normal")
  for (const line of textLines(page)) {
    const height = line.bottom - line.top
    // 글자 크기(pt)는 줄 높이의 약 0.8, 기준선은 줄의 아래에서 조금 위.
    pdf.setFontSize(Math.max(4, height * 0.8 * mm * (72 / 25.4)))
    pdf.text(line.text, (line.left - box.left) * mm, (line.top - box.top + height * 0.8) * mm, {
      renderingMode: "invisible",
    })
  }
}

type TextLine = { text: string; left: number; top: number; bottom: number }

// 보이는 글자 노드를 화면의 줄 단위로 나눈다. 한 줄에 들어가는 노드는 통째로, 여러 줄로
// 감긴 노드는 글자마다 자리를 재어 줄마다 끊는다.
export function textLines(root: HTMLElement): TextLine[] {
  const lines: TextLine[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ""
    if (!text.trim()) continue
    const parent = node.parentElement
    if (!parent || parent.closest("[aria-hidden='true']:not(.pdf-export)")) continue
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
    if (rects.length === 0) continue
    if (rects.length === 1) {
      lines.push({ text: text.trim(), left: rects[0].left, top: rects[0].top, bottom: rects[0].bottom })
      continue
    }
    let current: TextLine | null = null
    for (let index = 0; index < text.length; index++) {
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const rect = range.getBoundingClientRect()
      if (rect.height === 0) continue
      if (current && Math.abs(rect.top - current.top) < rect.height / 2) {
        current.text += text[index]
      } else {
        if (current?.text.trim()) lines.push({ ...current, text: current.text.trim() })
        current = { text: text[index], left: rect.left, top: rect.top, bottom: rect.bottom }
      }
    }
    if (current?.text.trim()) lines.push({ ...current, text: current.text.trim() })
  }
  return lines
}

const unquote = (value: string) => value.replace(/["']/g, "").trim()

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

// 페이지는 이미지가 되므로 글꼴이 그 안에 써 넣어진 것만 쓸 수 있다.
// Pretendard는 작은 파일 아흔 개 남짓(각각 글자 범위 하나)으로 오고,
// html-to-image는 그 모두를 가져와 써 넣으려 한다. 브라우저가 이미 페이지가
// 쓰는 것만 불러왔으므로 그것들만 넣는다. 읽을 수 있는 게 없으면
// undefined(html-to-image 자체 방식).
export async function loadedFontCSS() {
  const loaded = new Set<string>()
  for (const face of document.fonts) {
    if (face.status === "loaded") loaded.add(`${unquote(face.family)}|${face.weight}|${face.unicodeRange}`)
  }
  const faces: Promise<string>[] = []
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const style = rule.style
      const family = unquote(style.getPropertyValue("font-family"))
      const weight = style.getPropertyValue("font-weight") || "400"
      const range = style.getPropertyValue("unicode-range") || "U+0-10FFFF"
      if (!loaded.has(`${family}|${weight}|${range}`)) continue
      const source = style.getPropertyValue("src").match(/url\(["']?([^"')]+)["']?\)/)?.[1]
      if (!source) continue
      const url = new URL(source, sheet.href ?? document.baseURI).href
      faces.push(
        fetch(url)
          .then((response) => response.blob())
          .then(asDataUrl)
          .then(
            (data) =>
              `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;unicode-range:${range};src:url(${data})}`,
          ),
      )
    }
  }
  if (faces.length === 0) return undefined
  try {
    return (await Promise.all(faces)).join("\n")
  } catch {
    return undefined
  }
}
