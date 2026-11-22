import type { Program, ProgramReport, ProgramSchoolState, ProgramStatus } from "../types"

// 캠퍼스 캠페인의 단계를 보여 주는 말이다(값은 backend lib/programs.ts와 같다).
// 견적이 나온 캠페인은 운영비 결제를 기다린다.
export const programStatusLabels: Record<ProgramStatus, string> = {
  접수: "견적 준비 중",
  견적: "결제 대기",
  "섭외 중": "학교 섭외 중",
  "집행 중": "집행 중",
  완료: "집행 완료",
  취소: "취소됨",
}

// 캠페인 안에서 학교 하나가 있는 곳의 말이다(값은 backend lib/programs.ts의 schoolState와 같다).
export const programSchoolLabels: Record<ProgramSchoolState, string> = {
  후보: "후보",
  대기: "답 기다리는 중",
  수락: "수락, 계약 확인 전",
  "계약 확인": "계약 확인",
  "행사 완료": "행사 완료",
  거절: "거절",
  마감: "마감",
  취소: "취소됨",
}

// 진행 막대에 놓는 단계 순서다. 취소는 막대에 없다.
export const programSteps: ProgramStatus[] = ["접수", "견적", "섭외 중", "집행 중", "완료"]

// 방문자와 데모 계정이 보는 예시다. 가상의 브랜드 캠페인과 단체이며 실제 견적이 아니다.
// 운영비를 낸 뒤 후보 학교에 제안을 보내는 단계다.
export function exampleProgram(month: string): Program {
  return {
    id: "example",
    brief: {
      name: "신제품 캠퍼스 시음",
      product: "저당 탄산수 신제품",
      regions: ["서울", "경기"],
      from: month,
      to: month,
      schools: 5,
      perSchool: 300,
      unit: "잔",
      audience: "1~2학년",
      asks: "부스 시음과 행사 SNS 게시 1회",
    },
    status: "섭외 중",
    quote: {
      fee: 1_500_000,
      costs: [
        { label: "단체 지원금", amount: 2_500_000 },
        { label: "물류", amount: 500_000 },
      ],
      note: "학교마다 행사 하나, 시음 300잔 기준이에요.",
      quotedAt: `${month}-01T00:00:00.000Z`,
      costTotal: 3_000_000,
      feeWithVat: 1_650_000,
    },
    paidAt: `${month}-02T00:00:00.000Z`,
    transferRequested: false,
    schools: [
      { groupId: "example-a", name: "가온대 축제기획단", school: "가온대학교", event: { id: "example-a", name: "가온 봄 축제", date: `${month}-20` }, note: "축제 사흘, 하루 2,000명", state: "행사 완료", offerId: "example-a" },
      { groupId: "example-b", name: "누리대 밴드 동아리", school: "누리대학교", event: { id: "example-b", name: "정기 공연", date: `${month}-24` }, state: "계약 확인", offerId: "example-b" },
      { groupId: "example-c", name: "다온대 학생회", school: "다온대학교", note: "새내기 행사 400명", state: "대기", offerId: "example-c" },
      { groupId: "example-d", name: "마루대 응원단", school: "마루대학교", state: "후보" },
    ],
    createdAt: `${month}-01T00:00:00.000Z`,
    updatedAt: `${month}-01T00:00:00.000Z`,
  }
}

// 예시 캠페인의 통합 보고다. 위 예시의 수락된 두 학교이며, 가상의 수치다.
export function exampleProgramReport(month: string): ProgramReport {
  const row = { itemsTotal: 3, sharedWith: 1 }
  return {
    schools: [
      { ...row, groupId: "example-a", name: "가온대 축제기획단", school: "가온대학교", campaignId: "example-a", eventName: "가온 봄 축제 시음", date: `${month}-20`, state: "행사 완료", itemsDone: 3, proofs: 5, scans: 1240, coupons: 412, visits: 138, sales: 1_242_000, venue: 300 },
      { ...row, groupId: "example-b", name: "누리대 밴드 동아리", school: "누리대학교", campaignId: "example-b", eventName: "정기 공연 시음", date: `${month}-24`, state: "계약 확인", itemsDone: 1, proofs: 1, scans: 0, coupons: 0, visits: 0, sales: 0, venue: 0 },
    ],
    totals: { sent: 3, accepted: 2, confirmed: 2, finished: 1, itemsDone: 4, itemsTotal: 6, proofs: 6, scans: 1240, coupons: 412, visits: 138, sales: 1_242_000, venue: 300, cost: 4_500_000, costPerVisit: 32_609 },
  }
}
