// Kakao's (formerly Daum's) free address search, for a brand's store: the
// brand searches and picks its road address, so what is saved is a real
// address rather than one typed by hand. The address the brand picks is its
// own to keep; the service needs no key. Its script and its search frame are
// allowed in app.ts's Content-Security-Policy (and vercel.json's).
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

// Shows the search inside element; onPick gets the road address picked (or
// the lot address where a place has no road address).
export async function embedPostcode(element: HTMLElement, onPick: (address: string) => void) {
  const Postcode = await loadPostcode()
  new Postcode({
    oncomplete: (data) => onPick(data.roadAddress || data.jibunAddress || data.address),
    width: "100%",
    height: "100%",
  }).embed(element)
}
