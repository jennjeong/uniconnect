import { t } from "../i18n"
import type { Role } from "../types"

export const roles: Role[] = ["학생단체", "브랜드"]

export const roleOptions: {
  value: Role
  title: string
  caption: string
}[] = [
  // 각각 로고의 심벌과 함께 보인다 (components/RoleMark.tsx).
  // 누구인지(학생단체·기업)를 제목으로, 하는 일(협찬 받기·하기)을 설명으로 둔다.
  { value: "학생단체", title: t("학생단체"), caption: t("협찬 받기 · 동아리 · 학생회") },
  { value: "브랜드", title: t("기업 · 브랜드"), caption: t("협찬 하기 · 스폰서") },
]

// 가입·프로필 양식이 보여주는 묶음대로의 계정 유형. 순서까지
// backend/src/lib/validation.ts의 accountTypes와 같아야 한다
// (lib/lists.sync.test.ts가 검사한다).
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

// 학생회인 계정 유형. 자신에게 연결한 동아리를 본다 (backend lib/council.ts,
// lists.sync.test.ts가 검사한다).
export const councilTypes = ["총학생회", "단과대 학생회", "학과 학생회"]

export const accountTypes: Record<Role, string[]> = {
  학생단체: accountTypeGroups.학생단체.flatMap((group) => group.types),
  브랜드: accountTypeGroups.브랜드.flatMap((group) => group.types),
}

// 연락처 칸이 나열하는 흔한 직책 (components/PositionField.tsx). 그 밖의 직책은
// 직접 입력으로 고른다: 학생단체의 임원진과, 회사나 매장의 흔한 직함이다.
export const positionHints: Record<Role, string[]> = {
  학생단체: ["회장", "부회장", "총무", "기획부장", "홍보부장", "대외협력부장", "부원"],
  브랜드: ["대표", "이사", "본부장", "팀장", "부장", "차장", "과장", "대리", "주임", "사원", "점장"],
}

export const createLabel = (role: Role) =>
  role === "학생단체" ? t("새 행사 등록") : t("새 캠페인 등록")
