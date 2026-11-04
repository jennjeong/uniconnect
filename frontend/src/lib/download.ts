// 브라우저에 저장할 파일을 건넨다: 페이지에서 만든 것(데이터 다운로드, 달력
// 파일)이나 가져온 것(대화에서 받은 PDF).
export function saveFile(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}
