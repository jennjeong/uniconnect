import type { IconName } from "../components/Icon"
import type { NavLabel } from "../types"

export const navItems: { label: NavLabel; icon: IconName }[] = [
  { label: "대시보드", icon: "home" },
  { label: "추천 매칭", icon: "spark" },
  { label: "내 행사", icon: "calendar" },
  { label: "성과 측정", icon: "chart" },
  { label: "리포트", icon: "file" },
]
