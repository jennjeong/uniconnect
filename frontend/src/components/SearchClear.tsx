import { Icon } from "./Icon"
import { t } from "../i18n"

// The X at the end of a search box, shown while it holds words: empties it
// and puts the cursor back. Mouse-down is kept from taking the focus, which a
// box with suggestions would read as leaving.
export function SearchClear({ value, onClear }: { value: string; onClear: () => void }) {
  if (!value) return null
  return (
    <button
      aria-label={t("검색어 지우기")}
      className="search-clear"
      onClick={onClear}
      onMouseDown={(event) => event.preventDefault()}
      type="button"
    >
      <Icon name="close" size={14} />
    </button>
  )
}
