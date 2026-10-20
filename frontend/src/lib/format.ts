// Accepts "2026. 11. 27.", "2026-11-27", "11월 27일" and similar free-form input.
export function monthAndDay(date: string) {
  const numbers = (date.match(/\d+/g) ?? []).filter((part) => part.length <= 2)
  const [month = "-", day = "-"] = numbers.slice(-2)
  return { month, day }
}

export function formatRemaining(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

// Rounded percentage that stays 0 (not NaN) before any data has arrived.
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0

export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase()
