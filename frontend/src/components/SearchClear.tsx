import { Icon } from "./Icon"
import { t } from "../i18n"

// 검색창 끝의 X 버튼. 단어가 들어 있는 동안 보이며, 누르면 비우고 커서를
// 되돌린다. 마우스를 누를 때 포커스가 옮겨 가지 않게 막는다. 제안 목록이 있는
// 입력창은 포커스를 잃은 것으로 읽기 때문이다.
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
