// Installing uniconnect as an app, from the site: it opens in the browser
// first, and 앱 다운로드 (on the dashboard's hero and in the menu) installs
// it. Chrome and Edge offer that through the beforeinstallprompt event, kept
// here; everywhere else a guide tells how (modals/InstallGuideModal.tsx).

type InstallPrompt = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let offered: InstallPrompt | null = null
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((listener) => listener())

// Started before the app renders, so the event isn't missed.
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

// How 앱 다운로드 works here: "app" inside the installed app, which shows no
// button; "prompt" where the browser offers installing; "inapp" in another
// app's own browser, such as KakaoTalk's, which can't install, so the page
// goes to a browser first; "ios" on iPhone and iPad (the share sheet's 홈 화면에
// 추가); and "guide" in any other browser, or where the app is installed
// already.
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
  // iPadOS asks for pages as a Mac would, but Macs have no touch screen.
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

// KakaoTalk's browser hands an address on to the phone's own browser.
export const inKakaoTalk = () => /KAKAOTALK/i.test(navigator.userAgent)
export const kakaoTalkExternal = (url: string) => `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`

// Shows the browser's own install dialog; true when the app was installed.
export async function install() {
  const prompt = offered
  if (!prompt) return false
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  offered = null
  changed()
  return outcome === "accepted"
}
