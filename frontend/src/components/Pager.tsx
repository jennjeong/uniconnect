import { t } from "../i18n"
import { Icon } from "./Icon"

// 긴 목록 아래 가운데에 놓는 페이지 버튼. 이전, 각 페이지, 다음 순서다. 한
// 페이지에 다 들어가면 아무것도 보이지 않는다.
export function Pager({ page, pages, onPage, label }: { page: number; pages: number; onPage: (page: number) => void; label: string }) {
  if (pages <= 1) return null
  return (
    <nav aria-label={label} className="pager">
      <button aria-label={t("이전 페이지")} className="pager-step previous" disabled={page === 0} onClick={() => onPage(page - 1)} type="button">
        <Icon name="chevron" size={16} />
      </button>
      {Array.from({ length: pages }, (_, index) => (
        <button
          aria-current={index === page ? "page" : undefined}
          className={index === page ? "pager-page current" : "pager-page"}
          key={index}
          onClick={() => onPage(index)}
          type="button"
        >
          {index + 1}
        </button>
      ))}
      <button aria-label={t("다음 페이지")} className="pager-step" disabled={page === pages - 1} onClick={() => onPage(page + 1)} type="button">
        <Icon name="chevron" size={16} />
      </button>
    </nav>
  )
}
