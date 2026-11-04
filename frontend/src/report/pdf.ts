// A4 크기의 페이지 요소를 이미지로 캡처해 하나의 PDF로 저장한다. 두
// 라이브러리는 필요할 때 불러와서 메인 번들에 들어가지 않는다.
export async function exportPdf(pages: HTMLElement[], fileName: string) {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import("jspdf"), import("html-to-image")])
  await document.fonts.ready
  const fontEmbedCSS = await loadedFontCSS()

  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  for (const [index, page] of pages.entries()) {
    const image = await toJpeg(page, { backgroundColor: "#ffffff", fontEmbedCSS, pixelRatio: 2, quality: 0.92 })
    if (index > 0) pdf.addPage()
    pdf.addImage(image, "JPEG", 0, 0, 210, 297)
  }
  pdf.save(fileName)
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
