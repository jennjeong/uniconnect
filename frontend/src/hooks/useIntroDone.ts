import { useEffect, useState } from "react"

import { isIntroDone, onIntroDone } from "../lib/intro"

// 인트로 로더가 아직 화면에 있는 동안 false (lib/intro.ts).
export function useIntroDone() {
  const [done, setDone] = useState(isIntroDone)

  useEffect(() => onIntroDone(() => setDone(true)), [])

  return done
}
