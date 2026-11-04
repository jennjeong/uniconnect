import { useId } from "react"

import type { Role } from "../types"

// uniconnect 로고의 두 상징 (assets/brand/uniconnect_horizontal.svg)을 로고와
// 같은 도형으로 그린다. 학생단체가 나온 학교는 짙은 파랑으로, 브랜드인 회사는
// 창문이 있는 은색으로 그린다.
export function RoleMark({ role, size = 28 }: { role: Role; size?: number }) {
  const silver = useId()
  return (
    <svg
      aria-hidden="true"
      className="role-mark"
      height={size}
      viewBox={role === "학생단체" ? "5.6 9 26 23.6" : "32.5 9 26 23.6"}
      width={size}
    >
      {role === "학생단체" ? (
        <g fill="#1b3f8f">
          <path d="M7 19.5 L18.6 11 L30.2 19.5 Z" />
          <rect height="6.6" rx=".6" width="3.6" x="10.1" y="21" />
          <rect height="6.6" rx=".6" width="3.6" x="16.8" y="21" />
          <rect height="6.6" rx=".6" width="3.6" x="23.5" y="21" />
          <rect height="2.8" rx="1" width="21.2" x="8" y="28.4" />
        </g>
      ) : (
        <>
          <defs>
            <linearGradient id={silver} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#a9b4c8" />
              <stop offset="1" stopColor="#6d7b97" />
            </linearGradient>
          </defs>
          <rect fill={`url(#${silver})`} height="20.7" rx="2.6" width="19" x="36" y="10.5" />
          <g fill="#ffffff">
            <rect height="4" rx=".6" width="4" x="40" y="15" />
            <rect height="4" rx=".6" width="4" x="47" y="15" />
            <rect height="4" rx=".6" width="4" x="40" y="22" />
            <rect height="4" rx=".6" width="4" x="47" y="22" />
          </g>
        </>
      )}
    </svg>
  )
}
