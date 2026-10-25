import { Pill } from "./Pill"

// A catalog with no one in it yet: members see only members, so before the
// other side signs up there is nothing to list. Says so, and what to do
// meanwhile.
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
      <p>{text}</p>
      {action && (
        <Pill arrow="right" onClick={action.onClick} variant="outline">
          {action.label}
        </Pill>
      )}
    </div>
  )
}
