// 파일 이름에 넣을 글자. 다른 회원이 쓴 이름(행사명, 올린 파일의 이름)이 들어오므로,
// 보이는 순서나 모양을 바꾸는 제어 · 서식 문자(방향 바꿈 U+202E 같은 것, 폭 없는 문자,
// C0 · C1 제어 문자)는 지우고, 파일 이름에 쓸 수 없는 글자는 빈칸으로 바꾼다. 저장 창에서
// 이름이 다른 종류의 파일처럼 보이지 않게. 길이는 글자(코드 포인트) 단위로 줄인다.
export function safeFileName(text: string, limit = 120) {
  return Array.from(
    text
      .replace(/[\p{Cc}\p{Cf}]/gu, "")
      .replace(/[\\/:*?"<>|]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, limit)
    .join("")
    .trim()
}

// 브라우저에 저장할 파일을 건넨다: 페이지에서 만든 것(데이터 다운로드, 달력
// 파일)이나 가져온 것(대화에서 받은 PDF). 이름은 safeFileName을 거친다.
export function saveFile(name: string, contents: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = safeFileName(name) || "uniconnect-file"
  link.click()
  URL.revokeObjectURL(url)
}
