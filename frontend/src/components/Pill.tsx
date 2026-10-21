import type { ButtonHTMLAttributes } from "react"

import { Icon } from "./Icon"

// Stride's pill buttons from getlayers.ai: deep blue for the main action,
// white on blue panels, silver, or outlined (in silver on white, in white
// on blue), optionally with a round arrow badge that nudges toward where
// the button leads on hover.
export function Pill({
  variant = "primary",
  arrow,
  className,
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "white" | "silver" | "outline" | "outline-light"
  arrow?: "right" | "up-right"
}) {
  const classes = ["pill", variant, arrow && "with-arrow", className].filter(Boolean).join(" ")
  return (
    <button className={classes} type={type} {...rest}>
      <span>{children}</span>
      {arrow && (
        <i aria-hidden="true" className={arrow === "right" ? "pill-arrow" : "pill-arrow up-right"}>
          <Icon name={arrow === "right" ? "arrow" : "arrowUpRight"} size={16} />
        </i>
      )}
    </button>
  )
}
