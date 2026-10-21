// Captures each A4-sized page element as an image and saves them as one PDF.
// Both libraries load on demand, so they stay out of the main bundle.
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

// The pages become images, which can only use fonts written into them.
// Pretendard comes as ninety-odd small files (a range of characters each),
// and html-to-image would fetch and write in every one; the browser has
// already loaded just the ones the pages use, so only those go in.
// Undefined (html-to-image's own way) if none can be read.
async function loadedFontCSS() {
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
