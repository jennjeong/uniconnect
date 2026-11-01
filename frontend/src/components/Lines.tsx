import { Fragment } from "react"

// Copy split into lines where it pauses: after a sentence, and after a comma
// that closes a clause (가입하고, 보내면, 보내지니, …), which goes as the line break says
// it. A comma between listed words (쿠폰, 방문, 예상 매출) or inside brackets
// keeps the line going, as does a mark before a number or a bracket (1,000,
// 2026. 11. 27. (금), Nov 27, 2026) and an abbreviation (e.g., Est.). A piece
// shorter than shortPiece letters stays on the line with what follows it.
const shortPiece = 3
const clauseEnding = /(고|며|면|니|니까|지만|[는은인한던]데|[에해어아라워와려져돼써]서|도록|거나|든|해|[하히쉽게]게)$/
const abbreviation = /(^|\s)(e\.g|i\.e|est|avg|approx|stn|vs|no)\.$/i

function pauses(line: string, piece: string) {
  if (/[.?!]$/.test(line)) return !abbreviation.test(line)
  const clause = piece.slice(0, -1)
  const open = (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0)
  if (open > 0) return false
  // In Korean, a verb's joining ending after two words or more (not a listed
  // word such as 메시지, 계약서 or 가게).
  if (/[가-힣]$/.test(clause)) return clauseEnding.test(clause) && clause.trim().split(/\s+/).length >= 2
  // In English, a clause of three words or more since the last break.
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
