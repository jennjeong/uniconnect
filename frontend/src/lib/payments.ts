import type { PaymentOrder } from "../types"

// Toss Payments 결제창 (v2 SDK, 브랜드가 결제할 때만 불러온다.
// Content-Security-Policy가 허용한다). 결제창은
// ?payment=success&paymentKey…&orderId…&amount… 또는
// ?payment=fail&code…&message…를 붙여 이 페이지 주소로 돌아오며, App이 이를
// 읽고(readPaymentReturn) 서버가 승인한다.
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

// 주문에 대한 카드 결제창을 연다. 브라우저가 그리로 떠났다가 이 주소로
// 돌아온다.
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

// 주소 쿼리에 담긴 결제창의 답. 없으면 undefined. 호출한 쪽이 주소에서
// 걷어낸다.
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

// 결제창의 답을 뺀 주소.
export function withoutPaymentReturn(search: string) {
  const params = new URLSearchParams(search)
  for (const key of ["payment", "paymentKey", "orderId", "amount", "code", "message", "paymentType"]) params.delete(key)
  const rest = params.toString()
  return rest ? `?${rest}` : ""
}
