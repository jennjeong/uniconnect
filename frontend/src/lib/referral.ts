// 친구 초대: 초대 링크(/?ref=CODE, 어느 페이지든)가 가져온 코드를 가입이 보낼
// 때까지 이 탭에 보관한다. 저장소가 없으면 코드는 버린다.
const key = "uniconnect-ref"

export function keepReferral(search = location.search) {
  const code = new URLSearchParams(search).get("ref")?.toUpperCase()
  if (!code || !/^[A-Z0-9]{8}$/.test(code)) return
  try {
    sessionStorage.setItem(key, code)
  } catch {
    // 저장소가 없으면 코드 없이 가입한다.
  }
}

export function keptReferral() {
  try {
    return sessionStorage.getItem(key) ?? undefined
  } catch {
    return undefined
  }
}

// 회원이 공유하는 링크.
export const referralLink = (code: string) => `${location.origin}/?ref=${code}`
