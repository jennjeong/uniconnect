// Errors the page itself didn't catch go to the operators' log (backend
// lib/errorLog.ts, /admin): the message, where in the scripts, and the
// page's path without its query. Never names, emails or what was typed,
// and five a page at most.
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
