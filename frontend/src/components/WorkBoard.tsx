import { t } from "../i18n"
import { Icon } from "./Icon"

// 줄의 종류. 내가 할 일만 강조하고 '할 일 N가지'로 센다. 상대를 기다리는 일과 일정 ·
// 결과는 건수가 있어도 조용히 보인다(내 긴급한 일처럼 보이지 않게).
// - mine: 내가 답하거나 확인하거나 끝내야 하는 일
// - waiting: 내 쪽은 끝났고 상대를 기다리는 일
// - info: 다가오는 일정, 나온 결과처럼 알아 두면 되는 것
export type WorkKind = "mine" | "waiting" | "info"

export type WorkRow = {
  key: string
  kind: WorkKind
  label: string
  // 지금 이 일에 걸린 건수(실제 데이터). 0이면 한 줄로 조용히 보인다.
  count: number
  // 건수 옆의 짧은 설명(무엇을 하면 되는지, 가장 가까운 날 등).
  detail: string
  onOpen: () => void
}

const groups: { kind: WorkKind; title: string }[] = [
  { kind: "mine", title: "내가 할 일" },
  { kind: "waiting", title: "상대를 기다리는 일" },
  { kind: "info", title: "일정 · 결과" },
]

// 로그인한 회원의 대시보드 첫머리의 '업무 보드'. 지금 답하거나 확인해야 하는 일을
// 실제 데이터의 건수로 한 줄씩 보여 주고 줄을 누르면 그 일로 간다. 카드 묶음 대신
// 줄과 구분선이다. 근거 없는 '오늘 할 일 N개'를 만들지 않는다.
export function WorkBoard({ title, rows }: { title: string; rows: WorkRow[] }) {
  const open = rows.filter((row) => row.kind === "mine" && row.count > 0).length
  return (
    <section aria-labelledby="work-board-title" className="work-board">
      <div className="work-board-head">
        <h2 id="work-board-title">{title}</h2>
        <p>{open > 0 ? t("내가 할 일 {count}가지", { count: open }) : t("지금 내가 할 일은 없어요")}</p>
      </div>
      {groups.map((group) => {
        const list = rows.filter((row) => row.kind === group.kind)
        if (list.length === 0) return null
        const id = `work-board-${group.kind}`
        return (
          <div className={`work-board-group ${group.kind}`} key={group.kind}>
            <h3 id={id}>{t(group.title)}</h3>
            <ul aria-labelledby={id}>
              {list.map((row) => (
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
          </div>
        )
      })}
    </section>
  )
}
