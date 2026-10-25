import { useEffect, useState } from "react"

import { api, errorMessage } from "../api"
import type { MethodKind, VenuePage, VenueSession } from "../types"

// The PIN stays in this tab for the next confirmations, never in a
// participant's browser.
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
    // Without storage the PIN is typed again on the next visit.
  }
}

// A venue page's PIN and what it opens: once its 4 digits are in, the server
// answers the shares this side confirms for (or says the PIN is wrong); each
// confirmation brings that share's counts back as they now stand.
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

  // An answer for another PIN doesn't count.
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
