import { useEffect, useState } from "react"

import { installState, onInstallChange } from "../lib/install"

// 지금 앱을 설치할 수 있는지와 그 방법 (lib/install.ts). 최신 상태로 유지한다.
export function useInstallState() {
  const [state, setState] = useState(installState)
  useEffect(() => onInstallChange(() => setState(installState())), [])
  return state
}
