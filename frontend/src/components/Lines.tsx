import { Fragment } from "react"

// 카피를 쉬어 가는 곳에서 줄로 나눈다. 문장이 끝난 뒤와, 절을 닫는 쉼표 뒤
// (가입하고, 보내면, 보내지니, …)에서는 줄바꿈 표시가 말하는 대로 줄을 바꾼다.
// 나열한 단어 사이의 쉼표 (쿠폰, 방문, 예상 매출)나 괄호 안의 쉼표는 줄을 이어
// 간다. 숫자나 괄호 앞의 표시 (1,000, 2026. 11. 27. (금), Nov 27, 2026)와 약어
// (e.g., Est.)도 마찬가지다. shortPiece 글자보다 짧은 조각은 뒤따르는 말과 같은
// 줄에 둔다.
const shortPiece = 3
const clauseEnding = /(고|며|면|니|니까|지만|[는은인한던]데|[에해어아라워와려져돼써]서|도록|거나|든|해|[하히쉽게]게)$/
const abbreviation = /(^|\s)(e\.g|i\.e|est|avg|approx|stn|vs|no)\.$/i

function pauses(line: string, piece: string) {
  if (/[.?!]$/.test(line)) return !abbreviation.test(line)
  const clause = piece.slice(0, -1)
  const open = (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0)
  if (open > 0) return false
  // 한국어에서 두 단어 이상 뒤에 오는 동사의 연결 어미. 나열된 단어(메시지,
  // 계약서, 가게 같은 것)는 해당하지 않는다.
  if (/[가-힣]$/.test(clause)) return clauseEnding.test(clause) && clause.trim().split(/\s+/).length >= 2
  // 영어에서는 마지막 줄바꿈 뒤로 세 단어 이상이 이어진 절.
  return line.trim().split(/\s+/).length >= 3
}

export function splitLines(text: string) {
  const pieces = text.split(/(?<=[,.?!])\s+(?![\d(])/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  pieces.forEach((piece, index) => {
    line = line ? `${line} ${piece}` : piece
    const next = pieces[index + 1]
    if (next === undefined) return
    if (piece.replace(/[\s,.?!]/g, "").length < shortPiece && line === piece) return
    if (!pauses(line, piece)) return
    lines.push(line)
    line = ""
  })
  if (line) lines.push(line)
  return lines.map((part) => part.replace(/,$/, ""))
}

export function Lines({ text }: { text: string }) {
  const lines = splitLines(text)
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  )
}
