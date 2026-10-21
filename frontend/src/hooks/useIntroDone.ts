import { useEffect, useState } from "react"

import { isIntroDone, onIntroDone } from "../lib/intro"

// False while the intro loader is still on screen (lib/intro.ts).
export function useIntroDone() {
  const [done, setDone] = useState(isIntroDone)

  useEffect(() => onIntroDone(() => setDone(true)), [])

  return done
}
