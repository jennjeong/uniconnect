import { useEffect, useState } from "react"

import { api } from "../api"
import { faqs, type FaqItem } from "../data/faq"
import type { SiteState } from "../types"

// The operators' switches the whole site reads (GET /api/site): maintenance,
// whether sign-up is open, and the help center questions they added or hid.
// Read once per page load and shared; refreshSiteState reads it again.
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
    // Without it the site works as if nothing were switched on.
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

// The help center's questions: the built-in ones the operators haven't
// hidden, then the ones they added (in Korean only).
export function useFaqs(): FaqItem[] {
  const state = useSiteState()
  const hidden = new Set(state?.faq.hidden ?? [])
  return [
    ...faqs.filter((item) => !hidden.has(item.key)),
    ...(state?.faq.added ?? []).map((item) => ({ key: item.id, topic: item.topic, question: item.question, answer: item.answer, featured: item.featured })),
  ]
}
