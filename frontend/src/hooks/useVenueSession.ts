import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import type { MethodKind, VenuePage, VenueSession } from "../types"

// PIN은 이 탭에만 남겨 다음 확인에 쓰고, 참가자의 브라우저에는 두지 않는다.
const pinKey = (code: string, page: VenuePage) => `uniconnect-${page}-pin-${code}`

function readPin(code: string, page: VenuePage) {
  try {
    return sessionStorage.getItem(pinKey(code, page)) ?? ""
  } catch {
    return ""
  }
}

function writePin(code: string, page: VenuePage, pin: string) {
  try {
    sessionStorage.setItem(pinKey(code, page), pin)
  } catch {
    // 저장소가 없으면 다음 방문에 PIN을 다시 입력한다.
  }
}

// 행사장 페이지의 PIN과 그것이 여는 내용. 4자리가 들어오면 서버가 이쪽이
// 확인하는 몫을 답하고 (PIN이 틀리면 그렇게 알린다), 확인할 때마다 그 몫의 현재
// 카운트를 돌려준다.
export function useVenueSession(code: string, page: VenuePage) {
  const [pin, setPin] = useState(() => readPin(code, page))
  const [answer, setAnswer] = useState<{ pin: string; session?: VenueSession; error?: string }>()
  const [countError, setCountError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (pin.length !== 4) return
    let cancelled = false
    api.venueSession(code, page, pin).then(
      (session) => {
        if (cancelled) return
        setAnswer({ pin, session })
        writePin(code, page, pin)
      },
      (caught) => {
        if (!cancelled) setAnswer({ pin, error: errorMessage(caught) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [code, page, pin])

  // 다른 PIN에 대한 답은 반영하지 않는다.
  const current = answer?.pin === pin ? answer : undefined

  const count = async (share: string, method: MethodKind, amount: number) => {
    setBusy(true)
    setCountError("")
    try {
      const { share: next } = await api.venueCount(code, page, { pin, share, method, amount })
      setAnswer((last) =>
        last?.session
          ? { ...last, session: { ...last.session, shares: last.session.shares.map((item) => (item.id === next.id ? next : item)) } }
          : last,
      )
      return true
    } catch (caught) {
      setCountError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  return {
    pin,
    setPin: (value: string) => {
      setPin(value.replace(/\D/g, "").slice(0, 4))
      setCountError("")
    },
    session: current?.session ?? null,
    error: current?.error ?? countError,
    busy,
    count,
  }
}
