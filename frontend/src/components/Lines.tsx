import { Fragment } from "react"

// A sentence of copy split into lines where it pauses: after a comma (which
// goes, as the line break says it), and after a full stop, question or
// exclamation mark (which stay). A comma between digits, as in 1,000, is
// left alone.
export function splitLines(text: string) {
  return text
    .split(/(?<=[,.?!])\s+/)
    .map((line) => line.replace(/,$/, ""))
    .filter(Boolean)
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
