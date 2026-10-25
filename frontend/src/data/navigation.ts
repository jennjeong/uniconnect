import type { IconName } from "../components/Icon"
import type { NavLabel, Role } from "../types"

export type NavItem = {
  label: NavLabel
  icon: IconName
  // Shorter name for the phone tab bar.
  short?: string
}

// Student groups receive sponsorships and brands give them, so each side
// has its own menu.
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

// The page to show for a role: the picked one if that role has it.
export const pageFor = (role: Role, label: NavLabel): NavLabel =>
  navItems[role].some((item) => item.label === label) ? label : "대시보드"
