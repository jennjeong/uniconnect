// Kakao(예전 Daum)의 무료 주소 검색, 브랜드의 매장용: 브랜드가 검색해서 도로명
// 주소를 고르므로, 저장되는 것은 손으로 친 주소가 아니라 실제 주소다. 브랜드가
// 고른 주소는 그 브랜드가 간직하는 것이며, 이 서비스는 키가 필요 없다. 이
// 스크립트와 검색 프레임은 app.ts의 Content-Security-Policy(와 vercel.json)에서
// 허용한다.
type Postcode = new (options: {
  oncomplete: (data: { roadAddress: string; jibunAddress: string; address: string }) => void
  width?: string
  height?: string
}) => { embed: (element: HTMLElement) => void }

declare global {
  interface Window {
    daum?: { Postcode?: Postcode }
  }
}

const scriptUrl = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"
let loading: Promise<Postcode> | undefined

function loadPostcode() {
  loading ??= new Promise<Postcode>((resolve, reject) => {
    if (window.daum?.Postcode) return resolve(window.daum.Postcode)
    const script = document.createElement("script")
    script.src = scriptUrl
    script.async = true
    script.onload = () => (window.daum?.Postcode ? resolve(window.daum.Postcode) : reject(new Error("postcode missing")))
    script.onerror = () => reject(new Error("postcode failed"))
    document.head.append(script)
  }).catch((error) => {
    loading = undefined
    throw error
  })
  return loading
}

// element 안에 검색을 보여준다. onPick은 고른 도로명 주소를 받는다 (도로명
// 주소가 없는 곳이면 지번 주소).
export async function embedPostcode(element: HTMLElement, onPick: (address: string) => void) {
  const Postcode = await loadPostcode()
  new Postcode({
    oncomplete: (data) => onPick(data.roadAddress || data.jibunAddress || data.address),
    width: "100%",
    height: "100%",
  }).embed(element)
}
