import type { ReactNode } from "react"

import type { Industry } from "../types"

// 로고의 색. 각 마크는 짙은 파랑과 밝은 파랑에 은색 포인트를 더한다. 로고가
// 남색 학교와 은색 가게를 짝지은 방식과 같다.
const deep = "#1b3f8f"
const blue = "#2f63d9"
const light = "#8fb6ff"
const silver = "#aab5c7"
const silverDeep = "#8a96ad"

const line = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const

// 앱 아이콘의 64×64 격자에 맞춘 납작하고 둥근 마크. 각 마크는 타일 가운데 약
// 55% 안에 놓인다.
const art: Record<Industry, ReactNode> = {
  // 하트가 있는 커피잔, 김 두 줄, 받침 접시.
  cafe: (
    <>
      <path
        d="M27 22.5c-1.4-1.3-1.4-2.4 0-3.7s1.4-2.4 0-3.7M34 22.5c-1.4-1.3-1.4-2.4 0-3.7s1.4-2.4 0-3.7"
        {...line}
        stroke={silver}
        strokeWidth={2.6}
      />
      <path d="M41.5 29.5h2.2a4 4 0 0 1 0 8h-2.2" {...line} stroke={blue} strokeWidth={3.2} />
      <path
        d="M21.5 25.5h18a2 2 0 0 1 2 2V35a9.5 9.5 0 0 1-9.5 9.5h-3a9.5 9.5 0 0 1-9.5-9.5v-7.5a2 2 0 0 1 2-2Z"
        fill={blue}
      />
      <path
        d="M30.5 37.6c-.8-.6-4-2.6-4-4.9 0-1.2.9-2.1 2.1-2.1.8 0 1.5.4 1.9 1 .4-.6 1.1-1 1.9-1 1.2 0 2.1.9 2.1 2.1 0 2.3-3.2 4.3-4 4.9Z"
        fill="#fff"
      />
      <rect x="16.5" y="46.5" width="28" height="3.2" rx="1.6" fill={deep} />
    </>
  ),
  // 은색 렌즈의 카메라.
  photo: (
    <>
      <rect x="18.5" y="19.8" width="5" height="3.6" rx="1" fill={silver} />
      <path
        d="M25.5 23l2.2-3.6a1.6 1.6 0 0 1 1.4-.8h5.8a1.6 1.6 0 0 1 1.4.8l2.2 3.6Z"
        fill={deep}
      />
      <rect x="15" y="23" width="34" height="22" rx="6" fill={blue} />
      <rect x="41.5" y="26.2" width="4" height="2.8" rx="1" fill="#fff" />
      <circle cx="32" cy="34" r="7.6" fill="#fff" />
      <circle cx="32" cy="34" r="4.6" fill={silver} />
      <circle cx="30.4" cy="32.4" r="1.3" fill="#fff" />
    </>
  ),
  // 잎이 두 장인 새싹.
  wellness: (
    <>
      <path d="M32 44.5V32.5" {...line} stroke={deep} strokeWidth={3} />
      <path d="M31.2 38C24.5 38.9 18.4 35.1 17.4 27.6c7.4-1.1 12.9 2.5 13.8 10.4Z" fill={blue} />
      <path d="M32.8 32.1C33 22.9 39 16.5 47.2 16.3c.3 9.4-5.6 15.9-14.4 15.8Z" fill={light} />
      <path
        d="M29.2 35.9c-3-1.4-5.6-3.6-7.6-6.6M35.2 29.1c2.2-4.2 5.4-7.4 9.6-9.6"
        {...line}
        stroke="#fff"
        strokeWidth={1.5}
      />
      <rect x="24" y="44.5" width="16" height="3" rx="1.5" fill={deep} />
    </>
  ),
  // 남색과 은색 U자 거치대에 놓인 마이크. 로고의 U를 닮았다.
  performance: (
    <>
      <path d="M32 42.5v4" {...line} stroke={deep} strokeWidth={3.4} />
      <rect x="25" y="46.5" width="14" height="3" rx="1.5" fill={deep} />
      <path d="M20 28.5v2a12 12 0 0 0 12 12" {...line} stroke={deep} strokeWidth={3.4} />
      <path d="M44 28.5v2a12 12 0 0 1-12 12" {...line} stroke={silver} strokeWidth={3.4} />
      <rect x="25" y="14.5" width="14" height="20" rx="7" fill={blue} />
      <path d="M28.6 20h6.8M28.6 24h6.8M28.6 28h6.8" {...line} stroke="#fff" strokeWidth={2} />
    </>
  ),
  // 재생 버튼과 은색 진행 막대가 있는 영상 화면.
  content: (
    <>
      <path d="M32 41.5v4" {...line} stroke={deep} strokeWidth={3.2} />
      <rect x="25" y="45.5" width="14" height="3" rx="1.5" fill={deep} />
      <rect x="14" y="15.5" width="36" height="26" rx="5" fill={blue} />
      <path
        d="M29.2 21.7v10l8.3-5Z"
        fill="#fff"
        stroke="#fff"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
      <rect x="19" y="35.5" width="26" height="2" rx="1" fill="#fff" fillOpacity={0.45} />
      <rect x="19" y="35.5" width="10" height="2" rx="1" fill={silver} />
    </>
  ),
  // 은색 그림자 위로 튀어 오르는 농구공과 속도선 두 줄.
  sports: (
    <>
      <ellipse cx="34" cy="49" rx="10" ry="2.2" fill={silver} />
      <circle cx="34" cy="29" r="13.5" fill={blue} />
      <path
        d="M20.5 29h27M34 15.5v27M24.4 19.5c3.6 2.6 5.6 6 5.6 9.5s-2 6.9-5.6 9.5M43.6 19.5c-3.6 2.6-5.6 6-5.6 9.5s2 6.9 5.6 9.5"
        {...line}
        stroke={deep}
        strokeWidth={1.8}
      />
      <path d="M12.5 24h4.5M10.5 30h5" {...line} stroke={silverDeep} strokeWidth={2.4} />
    </>
  ),
  // 은색 케이스에 든 립스틱.
  beauty: (
    <>
      <path d="M27.4 28.4V20.2c0-1.1.6-2.1 1.6-2.6l7.6-3.8v14.6Z" fill={blue} />
      <rect x="25.5" y="28" width="13" height="7" rx="1.4" fill={silverDeep} />
      <rect x="24" y="33" width="16" height="15.5" rx="2.6" fill={silver} />
      <path d="M29.6 25.6v-5M27.3 37v8" {...line} stroke="#fff" strokeOpacity={0.6} strokeWidth={1.7} />
    </>
  ),
  // 은색 술이 달린 학사모.
  education: (
    <>
      <path d="M21 31.5v7c0 2.8 4.9 5.2 11 5.2s11-2.4 11-5.2v-7l-11 5.1Z" fill={deep} />
      <path d="M32 19.5 50 28 32 36.5 14 28Z" fill={blue} />
      <path d="M32 28l13.5 2.2v9" {...line} stroke={silver} strokeWidth={2} />
      <rect x="43.3" y="38.8" width="4.4" height="5" rx="1.4" fill={silver} />
      <circle cx="32" cy="28" r="1.8" fill={silver} />
    </>
  ),
}

export function IndustryArt({ industry }: { industry: Industry }) {
  return (
    <svg aria-hidden="true" className="industry-art" viewBox="0 0 64 64">
      {art[industry]}
    </svg>
  )
}
