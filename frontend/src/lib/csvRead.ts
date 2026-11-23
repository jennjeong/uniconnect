// CSV 읽기(#350 대량 등록). 엑셀에서 "CSV UTF-8"로 저장한 파일을 행과 칸으로 나눈다.
// 따옴표로 감싼 칸 안의 쉼표 · 줄바꿈 · 겹따옴표("")를 지원하고, 맨 앞의 BOM과 빈 줄은 버린다.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const source = text.replace(/^﻿/, "")
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ",") {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.some((value) => value.trim()))
}

// 대량 등록 양식의 머리글(한국어)과 서버가 받는 이름.
export const importColumns = [
  ["구분", "side"],
  ["이름", "name"],
  ["유형", "type"],
  ["학교 또는 주소", "place"],
  ["소개", "intro"],
  ["제공 · 모집", "offer"],
  ["태그", "tags"],
] as const

// 첫 줄을 머리글로 읽어 행마다 { side, name, ... }를 만든다. 머리글이 양식과 다르면 null.
export function importRows(table: string[][]) {
  const [head, ...body] = table
  if (!head) return null
  const index = importColumns.map(([label]) => head.findIndex((value) => value.trim() === label))
  if (index[0] < 0 || index[1] < 0 || index[2] < 0) return null
  return body.map((cells) =>
    Object.fromEntries(importColumns.map(([, key], column) => [key, index[column] >= 0 ? (cells[index[column]] ?? "").trim() : ""])),
  )
}
