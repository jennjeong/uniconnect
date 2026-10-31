// 친구 초대: the code an invitation link (/?ref=CODE, any page) brought, kept
// for this tab until sign-up sends it. Without storage the code is let go.
const key = "uniconnect-ref"

export function keepReferral(search = location.search) {
  const code = new URLSearchParams(search).get("ref")?.toUpperCase()
  if (!code || !/^[A-Z0-9]{8}$/.test(code)) return
  try {
    sessionStorage.setItem(key, code)
  } catch {
    // No storage: sign-up goes without it.
  }
}

export function keptReferral() {
  try {
    return sessionStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

// The link a member shares.
export const referralLink = (code: string) => `${location.origin}/?ref=${code}`
