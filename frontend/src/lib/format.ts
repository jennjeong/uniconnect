import { t } from "../i18n"
import type { EventItem } from "../types"

// Sponsor types for display, with what "기타" means spelled out.
export const sponsorTypeLabels = (event: EventItem) =>
  event.types.map((type) => (type === "기타" && event.typeNote ? `${t("기타")}(${event.typeNote})` : t(type)))

export function formatRemaining(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

// Rounded percentage that stays 0 (not NaN) before any data has arrived.
export const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0

export const initialOf = (name: string) => name.trim().charAt(0).toUpperCase()
