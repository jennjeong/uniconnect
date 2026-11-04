import compose from "../assets/franchises/compose.png"
import cu from "../assets/franchises/cu.png"
import ediya from "../assets/franchises/ediya.png"
import emart24 from "../assets/franchises/emart24.png"
import gs25 from "../assets/franchises/gs25.png"
import mammoth from "../assets/franchises/mammoth.png"
import megaMgc from "../assets/franchises/mega-mgc.png"
import sevenEleven from "../assets/franchises/seven-eleven.png"
import type { Franchise } from "../lib/franchises"

// 체인의 로고. Wikimedia Commons의 330px PNG 렌더이며, 각각 아트워크로서 퍼블릭
// 도메인이다. 각 로고는 여전히 그 회사의 상표이며, 매장이 어느 체인의 지점인지
// 알리는 용도로만 보여주고 파트너로 내세우지 않는다. 가로로 긴 로고는
// 워드마크이므로 더 넓은 타일에 그린다.
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
