import { Lines } from "./Lines"
import { Pill } from "./Pill"

// 아직 아무도 없는 카탈로그. 회원에게는 회원만 보이므로 반대편이 가입하기
// 전에는 보여 줄 목록이 없다. 이 사실과 그동안 할 일을 알려 준다.
export function CatalogEmpty({
  title,
  text,
  action,
}: {
  title: string
  text: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="catalog-empty">
      <strong>{title}</strong>
      <p><Lines text={text} /></p>
      {action && (
        <Pill arrow="right" onClick={action.onClick} variant="outline">
          {action.label}
        </Pill>
      )}
    </div>
  )
}
