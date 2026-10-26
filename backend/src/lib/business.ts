import { config } from "../config.js"

// What the National Tax Service says about a business registration: it
// matches and is open, it matches but the business has closed, or it doesn't
// match.
export type BusinessCheck = "valid" | "closed" | "invalid"

// Checks a business registration number with its opening date and the
// representative's name through data.go.kr (국세청_사업자등록정보 진위확인 및
// 상태조회 서비스, https://www.data.go.kr/data/15081808/openapi.do), once
// NTS_SERVICE_KEY is set. Nothing it answers is kept but the result. Tests
// swap `validate`.
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
    // "01": the registration matches. Its state "03" is a closed business.
    if (result?.valid !== "01") return "invalid"
    return result.status?.b_stt_cd === "03" ? "closed" : "valid"
  },
}
