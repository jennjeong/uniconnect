// Captures each A4-sized page element as an image and saves them as one PDF.
// Both libraries load on demand, so they stay out of the main bundle.
export async function exportPdf(pages: HTMLElement[], fileName: string) {
  const [{ jsPDF }, { toJpeg }] = await Promise.all([import("jspdf"), import("html-to-image")])
  await document.fonts.ready

  const pdf = new jsPDF({ unit: "mm", format: "a4" })
  for (const [index, page] of pages.entries()) {
    const image = await toJpeg(page, { backgroundColor: "#ffffff", pixelRatio: 2, quality: 0.92 })
    if (index > 0) pdf.addPage()
    pdf.addImage(image, "JPEG", 0, 0, 210, 297)
  }
  pdf.save(fileName)
}
