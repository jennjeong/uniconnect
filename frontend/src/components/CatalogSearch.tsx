import { useEffect, useRef } from "react"

import { api } from "../api"
import { Icon } from "./Icon"
import { SearchClear } from "./SearchClear"

// 카탈로그 위의 검색창. 돋보기 아이콘과 찾을 단어로 이루어진다 (lib/search.ts가
// 단어를 맞춘다). 입력이 잠시 멈추면 단어를 운영진용으로 센다. 입력한 사람은
// 기록하지 않는다.
export function CatalogSearch({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string
  // 검색창의 접근성 이름.
  label: string
  placeholder: string
  onChange: (value: string) => void
}) {
  const box = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const words = value.trim()
    if (words.length < 2) return
    const timer = window.setTimeout(() => void api.countSearch(words).catch(() => undefined), 1500)
    return () => window.clearTimeout(timer)
  }, [value])
  return (
    <label className="catalog-search">
      <Icon name="search" size={16} />
      <span className="sr-only">{label}</span>
      <input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} ref={box} type="search" value={value} />
      <SearchClear
        onClear={() => {
          onChange("")
          box.current?.focus()
        }}
        value={value}
      />
    </label>
  )
}
