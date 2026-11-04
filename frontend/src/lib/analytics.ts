// Google Analytics 4 이벤트. GA4 자체는 site.config.json의 측정
// ID(analytics.googleAnalyticsId)로 설정하며, 그러면 페이지에 gtag가 붙는다.
// 그전에는 이 호출들이 아무 일도 하지 않는다. 이벤트는 무슨 일이 어느 쪽에서
// 일어났는지만 말하고 누구인지는 말하지 않는다: 이름, 이메일, 메시지 내용은
// 담지 않는다.
type EventName =
  // 서버가 답하기 전, 제안하기나 문의하기를 누른 것.
  | "contact_click"
  // 서버가 받아들인 제안.
  | "generate_lead"
  // 서버가 만든 계정.
  | "sign_up"

type Params = Record<string, string | number>

export function track(name: EventName, params?: Params) {
  const gtag = (window as Window & { gtag?: (command: "event", name: string, params?: Params) => void }).gtag
  gtag?.("event", name, params)
}
