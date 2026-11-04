// 페이지가 스스로 잡지 못한 오류는 운영자의 로그로 간다 (backend
// lib/errorLog.ts, /admin): 메시지, 스크립트에서의 위치, 쿼리를 뺀 페이지 경로.
// 이름, 이메일, 입력한 내용은 절대 담지 않으며, 한 페이지에 최대 다섯 건이다.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")
const most = 5

export function installErrorReports() {
  let sent = 0
  const report = (message: string, where: string) => {
    if (sent >= most || !message) return
    sent += 1
    fetch(`${API_BASE}/api/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.slice(0, 300), where: where.slice(0, 200), path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined)
  }
  window.addEventListener("error", (event) => {
    report(event.message, event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "")
  })
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: unknown } | undefined
    report(String(reason?.message ?? event.reason ?? ""), "promise")
  })
}
