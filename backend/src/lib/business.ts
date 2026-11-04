import { config } from "../config.js"

// 국세청이 사업자등록에 대해 말하는 것: 일치하고 영업 중, 일치하지만 폐업,
// 또는 일치하지 않음.
export type BusinessCheck = "valid" | "closed" | "invalid"

// NTS_SERVICE_KEY가 있으면 data.go.kr(국세청_사업자등록정보 진위확인 및
// 상태조회 서비스, https://www.data.go.kr/data/15081808/openapi.do)로
// 사업자등록번호를 개업일, 대표자 이름과 함께 확인한다. 받은 답은 결과만
// 남기고 보관하지 않는다. 테스트는 `validate`를 바꿔 쓴다.
export const businessCheck = {
  ready: () => Boolean(config.ntsServiceKey),
  validate: async (input: { number: string; startDate: string; owner: string }): Promise<BusinessCheck> => {
    const url = `https://api.odcloud.kr/api/nts-businessman/v1/validate?serviceKey=${encodeURIComponent(config.ntsServiceKey ?? "")}`
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ businesses: [{ b_no: input.number, start_dt: input.startDate, p_nm: input.owner }] }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) throw new Error(`NTS answered ${response.status}`)
    const body = (await response.json()) as { data?: { valid?: string; status?: { b_stt_cd?: string } }[] }
    const result = body.data?.[0]
    // "01"은 등록 정보가 일치한다는 뜻이고 상태 "03"은 폐업이다.
    if (result?.valid !== "01") return "invalid"
    return result.status?.b_stt_cd === "03" ? "closed" : "valid"
  },
}
