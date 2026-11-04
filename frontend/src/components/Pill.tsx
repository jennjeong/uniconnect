import type { ButtonHTMLAttributes } from "react"

import { Icon } from "./Icon"

// getlayers.ai의 Stride가 쓰는 알약 버튼. 주요 동작은 짙은 파랑, 파란 패널
// 위에서는 흰색이고 그 밖에 은색이나 외곽선형이 있다 (흰 바탕에서는 은색, 파란
// 바탕에서는 흰색). 원하면 둥근 화살표 배지를 달 수 있고, 마우스를 올리면
// 버튼이 향하는 쪽으로 살짝 밀린다.
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
