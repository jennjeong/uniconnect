import type { PaymentOrder } from "../types"

// Toss Payments' payment window (v2 SDK, loaded only when a brand pays, as
// the Content-Security-Policy allows). The window comes back to this page's
// address with ?payment=success&paymentKey…&orderId…&amount… or
// ?payment=fail&code…&message…, which App reads (readPaymentReturn) and
// the server approves.
const sdkUrl = "https://js.tosspayments.com/v2/standard"

type TossPayments = (clientKey: string) => {
  payment: (options: { customerKey: string }) => {
    requestPayment: (request: Record<string, unknown>) => Promise<void>
  }
}

declare global {
  interface Window {
    TossPayments?: TossPayments
  }
}

let loading: Promise<TossPayments> | undefined

function loadSdk() {
  loading ??= new Promise<TossPayments>((resolve, reject) => {
    if (window.TossPayments) return resolve(window.TossPayments)
    const script = document.createElement("script")
    script.src = sdkUrl
    script.async = true
    script.onload = () => (window.TossPayments ? resolve(window.TossPayments) : reject(new Error("sdk")))
    script.onerror = () => {
      loading = undefined
      reject(new Error("sdk"))
    }
    document.head.append(script)
  })
  return loading
}

// Opens the card payment window for an order; the browser leaves for it and
// comes back to this address.
export async function payByCard({ order, customerKey, email }: PaymentOrder, clientKey: string) {
  const TossPayments = await loadSdk()
  const back = `${window.location.origin}${window.location.pathname}`
  await TossPayments(clientKey)
    .payment({ customerKey })
    .requestPayment({
      method: "CARD",
      amount: { currency: "KRW", value: order.amount },
      orderId: order.id,
      orderName: order.orderName,
      customerEmail: email,
      successUrl: `${back}?payment=success`,
      failUrl: `${back}?payment=fail`,
    })
}

export type PaymentReturn =
  | { ok: true; orderId: string; paymentKey: string; amount: number }
  | { ok: false; canceled: boolean; message: string }

// The payment window's answer in an address's query, or undefined; the
// caller takes it out of the address.
export function readPaymentReturn(search: string): PaymentReturn | undefined {
  const params = new URLSearchParams(search)
  const outcome = params.get("payment")
  if (outcome === "success") {
    const orderId = params.get("orderId") ?? ""
    const paymentKey = params.get("paymentKey") ?? ""
    const amount = Number(params.get("amount"))
    if (orderId && paymentKey && Number.isFinite(amount)) return { ok: true, orderId, paymentKey, amount }
    return { ok: false, canceled: false, message: "" }
  }
  if (outcome === "fail") {
    const code = params.get("code") ?? ""
    return { ok: false, canceled: code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL", message: params.get("message") ?? "" }
  }
  return undefined
}

// The address without the payment window's answer.
export function withoutPaymentReturn(search: string) {
  const params = new URLSearchParams(search)
  for (const key of ["payment", "paymentKey", "orderId", "amount", "code", "message", "paymentType"]) params.delete(key)
  const rest = params.toString()
  return rest ? `?${rest}` : ""
}
