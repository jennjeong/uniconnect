import type { Program, ProgramStatus } from "../types"

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

// 진행 막대에 놓는 단계 순서다. 취소는 막대에 없다.
export const programSteps: ProgramStatus[] = ["접수", "견적", "섭외 중", "집행 중", "완료"]

// 방문자와 데모 계정이 보는 예시다. 가상의 브랜드 캠페인이며 실제 견적이 아니다.
export function exampleProgram(month: string): Program {
  return {
    id: "example",
    brief: {
      name: "봄 학기 신제품 시음",
      product: "저당 탄산수 신제품",
      regions: ["서울", "경기"],
      from: month,
      to: month,
      schools: 5,
      perSchool: 300,
      audience: "1~2학년",
      asks: "부스 시음과 행사 SNS 게시 1회",
    },
    status: "견적",
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
    paidAt: null,
    transferRequested: false,
    createdAt: `${month}-01T00:00:00.000Z`,
    updatedAt: `${month}-01T00:00:00.000Z`,
  }
}
