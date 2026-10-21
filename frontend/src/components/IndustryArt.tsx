import type { ReactNode } from "react"

import type { Industry } from "../types"

// The logo's colors: each mark in deep and brighter blue with a silver
// accent, the way the logo pairs the school in navy with the shop in silver.
const deep = "#1b3f8f"
const blue = "#2f63d9"
const light = "#8fb6ff"
const silver = "#aab5c7"
const silverDeep = "#8a96ad"

const line = { fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const

// Flat, rounded marks on the app icon's 64×64 grid. Each one
// sits centered in about the middle 55% of the tile.
const art: Record<Industry, ReactNode> = {
  // Coffee cup with a heart, two wisps of steam and a saucer.
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
  // Camera with a silver lens.
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
  // Sprout with two leaves.
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
  // Microphone in a navy and silver U holder, like the logo's U.
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
  // Video screen with a play button and a silver progress bar.
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
  // Silver trophy with a white star on a navy stand.
  sports: (
    <>
      <path
        d="M24 21.7h-3.5a1.6 1.6 0 0 0-1.6 1.8c.3 4 2.8 6.6 6.6 7.2M40 21.7h3.5a1.6 1.6 0 0 1 1.6 1.8c-.3 4-2.8 6.6-6.6 7.2"
        {...line}
        stroke={silverDeep}
        strokeWidth={3}
      />
      <rect x="30" y="33.7" width="4" height="5.6" fill={silverDeep} />
      <path d="M23.5 16.7h17v9a8.5 8.5 0 0 1-17 0Z" fill={silver} />
      <path
        d="M32 20.4 33.06 23.14 35.99 23.3 33.71 25.16 34.47 28 32 26.4 29.53 28 30.29 25.16 28.01 23.3 30.94 23.14Z"
        fill="#fff"
      />
      <rect x="24.5" y="39.2" width="15" height="8" rx="2.4" fill={deep} />
      <rect x="28.5" y="42.1" width="7" height="2.2" rx="1.1" fill="#fff" />
    </>
  ),
  // Lipstick in a silver case.
  beauty: (
    <>
      <path d="M27.4 28.4V20.2c0-1.1.6-2.1 1.6-2.6l7.6-3.8v14.6Z" fill={blue} />
      <rect x="25.5" y="28" width="13" height="7" rx="1.4" fill={silverDeep} />
      <rect x="24" y="33" width="16" height="15.5" rx="2.6" fill={silver} />
      <path d="M29.6 25.6v-5M27.3 37v8" {...line} stroke="#fff" strokeOpacity={0.6} strokeWidth={1.7} />
    </>
  ),
  // Graduation cap with a silver tassel.
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
