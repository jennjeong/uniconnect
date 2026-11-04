import type { IconName } from "../components/Icon"
import type { NavLabel, Role } from "../types"

export type NavItem = {
  label: NavLabel
  icon: IconName
  // 휴대폰 탭 바용으로 줄인 이름.
  short?: string
}

// 학생단체는 협찬을 받고 브랜드는 협찬을 주므로 각자 메뉴가 있다.
export const navItems: Record<Role, NavItem[]> = {
  학생단체: [
    { label: "대시보드", icon: "home" },
    { label: "추천 매칭", icon: "spark", short: "매칭" },
    { label: "받은 협찬", icon: "inbox" },
    { label: "내 행사", icon: "calendar" },
    { label: "성과", icon: "chart" },
    { label: "리포트", icon: "file" },
  ],
  브랜드: [
    { label: "대시보드", icon: "home" },
    { label: "단체 찾기", icon: "users" },
    { label: "받은 제안", icon: "inbox" },
    { label: "행사 일정", icon: "calendar" },
    { label: "성과 분석", icon: "chart" },
  ],
}

// 역할에 보여줄 페이지: 그 역할에 있으면 고른 것.
export const pageFor = (role: Role, label: NavLabel): NavLabel =>
  navItems[role].some((item) => item.label === label) ? label : "대시보드"
