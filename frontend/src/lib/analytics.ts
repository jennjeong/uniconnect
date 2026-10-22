// Google Analytics 4 events. GA4 itself is set up by its measurement ID in
// .figma/make/site.json (analytics.googleAnalyticsId), which adds gtag to
// the page; until then these calls do nothing. Events say what happened
// and on which side, never who: no names, emails or message text.
type EventName =
  // A press on 제안하기 or 문의하기, before the server has answered.
  | "contact_click"
  // A proposal the server accepted.
  | "generate_lead"
  // An account the server created.
  | "sign_up"

type Params = Record<string, string | number>

export function track(name: EventName, params?: Params) {
  const gtag = (window as Window & { gtag?: (command: "event", name: string, params?: Params) => void }).gtag
  gtag?.("event", name, params)
}
