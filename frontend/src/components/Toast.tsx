import { useContext } from "react"

import { Icon } from "./Icon"
import { ClosingContext } from "./Presence"

// Short message after an action; inside a Presence it sinks away when hidden.
export function Toast({ message }: { message: string }) {
  const closing = useContext(ClosingContext)
  return (
    <div className={closing ? "toast closing" : "toast"} role="status">
      <Icon name="check" size={18} />
      {message}
    </div>
  )
}
