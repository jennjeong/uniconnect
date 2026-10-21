import qrcode from "qrcode-generator"
import { useMemo } from "react"

// Scannable QR code, drawn as one SVG path of its dark modules in the
// deepest point blue, still far darker than scanners need (13:1 on white).
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M")
    qr.addData(value)
    qr.make()
    const count = qr.getModuleCount()
    let modules = ""
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) modules += `M${col} ${row}h1v1h-1z`
      }
    }
    return { size: count, path: modules }
  }, [value])

  return (
    <svg
      aria-label={label}
      className="qr-svg"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`-2 -2 ${size + 4} ${size + 4}`}
    >
      <rect fill="#fff" height={size + 4} width={size + 4} x={-2} y={-2} />
      <path d={path} fill="#13306f" />
    </svg>
  )
}
