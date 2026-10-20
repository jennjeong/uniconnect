// Normalizes "2026. 11. 27.", "2026-11-27" and similar to "2026-11-27".
// Returns undefined when the value is not a real calendar day.
export function toIsoDate(value: string) {
  const match = /^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/.exec(value.trim())
  if (!match) return undefined
  const [, year, month, day] = match
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
  const date = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return undefined
  return iso
}
