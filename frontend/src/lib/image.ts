import { t } from "../i18n"

// A picked image as a small square logo for the listing: drawn centered on
// white at `size` pixels, as WebP (JPEG where the browser cannot write
// WebP), stepping down until it fits the server's limit of about 100KB.
const maxLength = 140_000

export async function logoFromFile(file: File) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new Error(t("PNG, JPG, WebP 이미지를 골라 주세요."))
  }
  const bitmap = await createImageBitmap(file)
  for (const size of [256, 192, 128]) {
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) break
    context.fillStyle = "#fff"
    context.fillRect(0, 0, size, size)
    const scale = Math.min(size / bitmap.width, size / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    context.drawImage(bitmap, (size - width) / 2, (size - height) / 2, width, height)
    for (const type of ["image/webp", "image/jpeg"]) {
      const url = canvas.toDataURL(type, 0.85)
      if (url.startsWith(`data:${type}`) && url.length <= maxLength) return url
    }
  }
  throw new Error(t("이미지가 너무 커요. 더 작은 이미지를 골라 주세요."))
}
