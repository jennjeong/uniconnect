import { Icon } from "./Icon"

// The search box above a catalog: a magnifier and the words to find
// (lib/search.ts matches them).
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
  return (
    <label className="catalog-search">
      <Icon name="search" size={16} />
      <span className="sr-only">{label}</span>
      <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type="search" value={value} />
    </label>
  )
}
