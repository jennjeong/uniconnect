import type { CSSProperties } from "react"

import { Icon } from "./Icon"

const sparks = [0, 1, 2, 3, 4, 5, 6, 7]

// The 찜 heart. After a press that saves (`burst` counts them), it pops in
// filled while a ring spreads and thins and eight sparks fly out.
export function SaveHeart({ saved, burst, size }: { saved: boolean; burst: number; size: number }) {
  const bursting = saved && burst > 0
  return (
    <span className="save-heart" key={burst}>
      <span className={bursting ? "save-heart-icon pop" : "save-heart-icon"}>
        <Icon name="heart" size={size} />
      </span>
      {bursting && (
        <span aria-hidden="true" className="save-burst">
          <span className="save-burst-ring" />
          {sparks.map((spark) => (
            <span className="save-burst-spark" key={spark} style={{ "--spark": spark } as CSSProperties} />
          ))}
        </span>
      )}
    </span>
  )
}
