import { useEffect, useState } from "react"

import { api } from "../api"
import { faqs, type FaqItem } from "../data/faq"
import type { SiteState } from "../types"

// 사이트 전체가 읽는 운영진의 스위치 (GET /api/site). 점검 여부, 가입이 열려
// 있는지, 운영진이 추가하거나 숨긴 도움말 센터 질문이 담긴다. 페이지를 불러올
// 때 한 번 읽어 공유하고, refreshSiteState가 다시 읽는다.
let cached: SiteState | undefined
let loading: Promise<SiteState | undefined> | undefined
const listeners = new Set<(state: SiteState | undefined) => void>()

export function refreshSiteState() {
  loading = api.siteState().then(
    (state) => {
      cached = state
      for (const listener of listeners) listener(state)
      return state
    },
    // 없으면 아무것도 켜지 않은 것처럼 사이트가 동작한다.
    () => undefined,
  )
  return loading
}

export function useSiteState() {
  const [state, setState] = useState(cached)
  useEffect(() => {
    listeners.add(setState)
    if (!loading) void refreshSiteState()
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}

// 도움말 센터의 질문. 운영진이 숨기지 않은 기본 질문 뒤에 운영진이 추가한
// 질문이 온다 (한국어로만).
export function useFaqs(): FaqItem[] {
  const state = useSiteState()
  const hidden = new Set(state?.faq.hidden ?? [])
  return [
    ...faqs.filter((item) => !hidden.has(item.key)),
    ...(state?.faq.added ?? []).map((item) => ({ key: item.id, topic: item.topic, question: item.question, answer: item.answer, featured: item.featured })),
  ]
}
