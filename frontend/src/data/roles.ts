import { t } from "../i18n"
import type { Role } from "../types"

export const roles: Role[] = ["학생단체", "브랜드"]

export const roleOptions: {
  value: Role
  title: string
  caption: string
}[] = [
  // Each shows with its symbol from the logo (components/RoleMark.tsx).
  { value: "학생단체", title: t("협찬 받기"), caption: t("학생단체 · 동아리") },
  { value: "브랜드", title: t("협찬 하기"), caption: t("스폰서 · 브랜드") },
]

// Account types, in the groups the sign-up and profile forms show them in.
// In order they must equal accountTypes in backend/src/lib/validation.ts
// (lib/lists.sync.test.ts checks).
export const accountTypeGroups: Record<Role, { label: string; types: string[] }[]> = {
  학생단체: [
    { label: "학생회 · 기획단", types: ["총학생회", "단과대 학생회", "학과 학생회", "축제 · 행사 기획단"] },
    {
      label: "공연 · 예술",
      types: ["공연 동아리", "밴드 · 음악 동아리", "댄스 동아리", "연극 · 뮤지컬 동아리", "사진 · 영상 동아리"],
    },
    {
      label: "학술 · 활동",
      types: ["학술 동아리", "창업 · 경영 동아리", "국제교류 · 어학 동아리", "언론 · 방송 동아리"],
    },
    { label: "봉사 · 생활", types: ["봉사 동아리", "스포츠 동아리", "게임 · e스포츠 동아리", "종교 동아리"] },
    { label: "연합 · 기타", types: ["연합 동아리", "서포터즈 · 홍보대사", "기타"] },
  ],
  브랜드: [
    { label: "식음료", types: ["카페 · 식음료", "베이커리 · 디저트", "음식점", "주점 · 펍", "편의점 · 마트"] },
    { label: "뷰티 · 패션", types: ["뷰티 · 화장품", "헤어 · 네일", "패션 · 의류"] },
    { label: "콘텐츠 · IT", types: ["사진 · 스튜디오", "콘텐츠 · 미디어", "게임 · 엔터테인먼트", "IT · 앱 서비스"] },
    { label: "교육 · 문화", types: ["교육 · 학원", "출판 · 문구", "문화 · 공연"] },
    {
      label: "생활 · 서비스",
      types: ["스포츠 · 피트니스", "헬스케어 · 웰니스", "여행 · 숙박", "금융 · 보험", "생활용품 · 리빙", "기타"],
    },
  ],
}

// Account types that are student councils, which see the clubs that link
// to them (backend lib/council.ts; lists.sync.test.ts checks).
export const councilTypes = ["총학생회", "단과대 학생회", "학과 학생회"]

export const accountTypes: Record<Role, string[]> = {
  학생단체: accountTypeGroups.학생단체.flatMap((group) => group.types),
  브랜드: accountTypeGroups.브랜드.flatMap((group) => group.types),
}

// The usual positions the contact fields list (components/PositionField.tsx),
// with 직접 입력 for any other: a student group's officers, and the common
// titles at a company or a store.
export const positionHints: Record<Role, string[]> = {
  학생단체: ["회장", "부회장", "총무", "기획부장", "홍보부장", "대외협력부장", "부원"],
  브랜드: ["대표", "이사", "본부장", "팀장", "부장", "차장", "과장", "대리", "주임", "사원", "점장"],
}

export const createLabel = (role: Role) =>
  role === "학생단체" ? t("새 행사 등록") : t("새 캠페인 등록")
