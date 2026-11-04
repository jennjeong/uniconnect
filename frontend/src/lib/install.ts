// 사이트에서 uniconnect를 앱으로 설치하기: 먼저 브라우저에서 열리며, 앱
// 다운로드(대시보드 히어로와 메뉴에 있다)로 설치한다. Chrome과 Edge는
// beforeinstallprompt 이벤트로 설치를 제안하며 그 이벤트를 여기에 보관한다. 그
// 밖의 곳에서는 안내가 방법을 알려준다 (modals/InstallGuideModal.tsx).

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let offered: InstallPrompt | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((listener) => listener())

// 이벤트를 놓치지 않도록 앱이 렌더링되기 전에 시작한다.
export function watchInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    offered = event as InstallPrompt
    changed()
  })
  window.addEventListener("appinstalled", () => {
    offered = null
    changed()
  })
}

export function onInstallChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 앱 다운로드가 여기서 동작하는 방식: 설치된 앱 안은 "app"(버튼이 없다),
// 브라우저가 설치를 제안하면 "prompt", KakaoTalk 같은 다른 앱의 자체 브라우저는
// "inapp"(설치할 수 없으므로 먼저 브라우저로 보낸다), iPhone과 iPad는
// "ios"(공유 시트의 홈 화면에 추가), 그 밖의 브라우저나 이미 설치된 곳은
// "guide".
export type InstallKind = "app" | "prompt" | "inapp" | "ios" | "guide"

export function installKind(here: {
  standalone: boolean
  offered: boolean
  userAgent: string
  touchPoints: number
}): InstallKind {
  if (here.standalone) return "app"
  if (here.offered) return "prompt"
  if (/KAKAOTALK|NAVER\(inapp|DaumApps|Instagram|FBAN|FBAV|\bLine\//i.test(here.userAgent)) return "inapp"
  // iPadOS는 Mac처럼 페이지를 요청하지만 Mac에는 터치스크린이 없다.
  if (/iphone|ipad|ipod/i.test(here.userAgent) || (/macintosh/i.test(here.userAgent) && here.touchPoints > 1)) {
    return "ios"
  }
  return "guide"
}

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

export function installState(): InstallKind {
  return installKind({
    standalone: standalone(),
    offered: offered !== null,
    userAgent: navigator.userAgent,
    touchPoints: navigator.maxTouchPoints ?? 0,
  })
}

// KakaoTalk의 브라우저는 주소를 휴대폰 자체 브라우저로 넘긴다.
export const inKakaoTalk = () => /KAKAOTALK/i.test(navigator.userAgent)
export const kakaoTalkExternal = (url: string) => `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`

// 브라우저의 설치 대화상자를 띄운다. 앱이 설치됐으면 true.
export async function install() {
  const prompt = offered
  if (!prompt) return false
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  offered = null
  changed()
  return outcome === "accepted"
}
