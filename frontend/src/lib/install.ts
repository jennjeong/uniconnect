// Installing uniconnect as an app. Chrome and Edge offer it through the
// beforeinstallprompt event, kept here to show 앱 설치 in the menu; Safari on
// iPhone and iPad has no such event, so the menu tells how to add it there.

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

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// "prompt" when the browser offers installing, "ios" in Safari on iPhone and
// iPad (added from the share sheet), "none" once installed or elsewhere.
export function installState(): "prompt" | "ios" | "none" {
  if (offered) return "prompt"
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone()) return "ios"
  return "none"
}

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
