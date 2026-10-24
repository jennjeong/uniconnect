import { useEffect, useState } from "react"

import { installState, onInstallChange } from "../lib/install"

// Whether and how the app can be installed now (lib/install.ts), kept current.
export function useInstallState() {
  const [state, setState] = useState(installState)
  useEffect(() => onInstallChange(() => setState(installState())), [])
  return state
}
