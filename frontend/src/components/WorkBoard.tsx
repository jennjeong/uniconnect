import { t } from "../i18n"
import { Icon } from "./Icon"

export type WorkRow = {
  key: string
  label: string
  // 지금 이 일에 걸린 건수. 0이면 한 줄로 조용히 보이고, 0보다 크면 강조된다.
  count: number
  // 건수 옆의 짧은 설명(무엇을 하면 되는지, 가장 가까운 날 등).
  detail: string
  onOpen: () => void
}

// 로그인한 회원의 대시보드에서 히어로 바로 아래의 '업무 보드'. 지금 답하거나
// 확인해야 하는 일을 한 줄씩, 실제 데이터의 건수로 보여 주고 줄을 누르면 그 일로
// 간다. 카드 묶음 대신 줄과 구분선이다. 근거 없는 '오늘 할 일 N개'를 만들지 않는다.
export function WorkBoard({ title, rows }: { title: string; rows: WorkRow[] }) {
  const open = rows.filter((row) => row.count > 0).length
  return (
    <section aria-labelledby="work-board-title" className="work-board">
      <div className="work-board-head">
        <h2 id="work-board-title">{title}</h2>
        <p>{open > 0 ? t("확인할 일 {count}가지", { count: open }) : t("지금 기다리는 일이 없어요")}</p>
      </div>
      <ul>
        {rows.map((row) => (
          <li className={row.count > 0 ? "has-work" : undefined} key={row.key}>
            <button onClick={row.onOpen} type="button">
              <strong className="work-board-count">{row.count.toLocaleString("ko-KR")}</strong>
              <span className="work-board-copy">
                <span className="work-board-label">{row.label}</span>
                <small>{row.detail}</small>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
