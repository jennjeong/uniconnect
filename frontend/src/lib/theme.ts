// 회원 화면의 다크 모드(#351). 고른 것은 이 브라우저에 둔다: 밝게(기본), 어둡게, 기기 설정 따라.
// <html data-theme="dark">가 index.css의 "Dark mode" 토큰을 켠다. 운영자 콘솔(/admin)은
// 자기 다크 모드가 따로 있으므로 여기서 건드리지 않는다(main.tsx가 부르지 않는다).

export type ThemeChoice = "light" | "dark" | "system"

const storageKey = "uniconnect-theme"
const media = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null)

export function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved === "dark" || saved === "system" ? saved : "light"
  } catch {
    return "light"
  }
}

export const resolvedTheme = (choice: ThemeChoice, systemDark = Boolean(media()?.matches)) =>
  choice === "system" ? (systemDark ? "dark" : "light") : choice

export function applyTheme(choice = readTheme()) {
  const root = document.documentElement
  if (resolvedTheme(choice) === "dark") root.dataset.theme = "dark"
  else delete root.dataset.theme
}

let listening = false

// 처음 그리기 전에 부른다. 기기 설정을 따르면 설정이 바뀔 때도 따라간다.
export function startTheme() {
  applyTheme()
  if (listening) return
  listening = true
  media()?.addEventListener?.("change", () => {
    if (readTheme() === "system") applyTheme("system")
  })
}

export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === "light") localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, choice)
  } catch {
    // 저장하지 못해도 이번 화면에는 바로 적용한다.
  }
  applyTheme(choice)
}
