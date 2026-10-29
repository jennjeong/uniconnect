import { useEffect } from "react"

import { api } from "../api"
import { Icon } from "./Icon"

// The search box above a catalog: a magnifier and the words to find
// (lib/search.ts matches them). Once typing stops for a moment, the words
// are counted for the operators, without who typed them.
export function CatalogSearch({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string
  // The box's accessible name.
  label: string
  placeholder: string
  onChange: (value: string) => void
}) {
  useEffect(() => {
    const words = value.trim()
    if (words.length < 2) return
    const timer = window.setTimeout(() => void api.countSearch(words).catch(() => undefined), 1500)
    return () => window.clearTimeout(timer)
  }, [value])
  return (
    <label className="catalog-search">
      <Icon name="search" size={16} />
      <span className="sr-only">{label}</span>
      <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type="search" value={value} />
    </label>
  )
}
