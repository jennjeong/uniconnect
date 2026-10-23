import compose from "../assets/franchises/compose.png"
import cu from "../assets/franchises/cu.png"
import ediya from "../assets/franchises/ediya.png"
import emart24 from "../assets/franchises/emart24.png"
import gs25 from "../assets/franchises/gs25.png"
import mammoth from "../assets/franchises/mammoth.png"
import megaMgc from "../assets/franchises/mega-mgc.png"
import sevenEleven from "../assets/franchises/seven-eleven.png"
import type { Franchise } from "../lib/franchises"

// The chains' logos, as 330px PNG renders from Wikimedia Commons, where each
// is public domain as artwork. Each stays its company's trademark, shown only
// to say whose branch a shop is, never as a partner. A wide logo is a
// wordmark, drawn in a wider tile.
export const franchiseLogos: Record<Franchise, { src: string; wide: boolean }> = {
  gs25: { src: gs25, wide: true },
  cu: { src: cu, wide: false },
  "seven-eleven": { src: sevenEleven, wide: false },
  emart24: { src: emart24, wide: true },
  mammoth: { src: mammoth, wide: true },
  "mega-mgc": { src: megaMgc, wide: true },
  ediya: { src: ediya, wide: true },
  compose: { src: compose, wide: true },
}
