import type { CSSProperties } from "react"

import { Icon } from "./Icon"

const sparks = [0, 1, 2, 3, 4, 5, 6, 7]

// 찜 하트. 저장하는 누름 뒤(`burst`가 센다) 채워진 하트가 튀어나오고, 링이
// 퍼지며 얇아지고 불꽃 여덟 개가 날아간다.
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
