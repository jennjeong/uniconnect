import { t } from "../i18n"

// 합의서의 증빙으로 고른 사진: 긴 변을 최대 1280픽셀로 줄이고 WebP(또는 JPEG)로
// 바꾸며, 서버 한도에 들어갈 때까지 품질을 낮춘다.
const photoMaxLength = 280_000

export async function photoFromFile(file: File) {
  if (!/^image\/(png|jpeg|webp|heic|heif|gif)$/.test(file.type) && file.type !== "") {
    throw new Error(t("PNG, JPG, WebP 이미지를 골라 주세요."))
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error(t("PNG, JPG, WebP 이미지를 골라 주세요."))
  })
  for (const edge of [1280, 960, 720, 540]) {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext("2d")
    if (!context) break
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.82, 0.68]) {
      for (const type of ["image/webp", "image/jpeg"]) {
        const url = canvas.toDataURL(type, quality)
        if (url.startsWith(`data:${type}`) && url.length <= photoMaxLength) return url
      }
    }
  }
  throw new Error(t("이미지가 너무 커요. 더 작은 이미지를 골라 주세요."))
}

// 리스팅의 작은 정사각형 로고로 고른 이미지: 흰 배경 한가운데에 `size` 픽셀로
// 그린다. WebP(브라우저가 WebP를 쓸 수 없으면 JPEG)로 바꾸며, 서버 한도인 약
// 100KB에 들어갈 때까지 품질을 낮춘다.
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
