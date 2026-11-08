import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { navItems } from "../data/navigation"
import { t, tc } from "../i18n"
import type { NavLabel, Role } from "../types"

// 어떤 화면에도 없는 주소(서버가 404로 답한다). 그렇다고 알리고 홈으로 가는
// 길과 역할의 페이지를 보여 준다.
export function NotFoundPage({
  role,
  onHome,
  onNavigate,
}: {
  role: Role
  onHome: () => void
  onNavigate: (label: NavLabel) => void
}) {
  return (
    <section className="page-view not-found">
      <PageIntro
        eyebrow={tc("eyebrow", "404 · 없는 페이지")}
        title={t("페이지를 찾을 수 없어요")}
        description={t("없거나 옮겨진 페이지예요. 홈에서 다시 시작해 보세요.")}
        actions={
          <Pill arrow="right" onClick={onHome}>
            {t("홈으로 가기")}
          </Pill>
        }
      />
      <ul aria-label={t("주요 메뉴")} className="not-found-links stagger">
        {navItems[role]
          .filter((item) => item.label !== "대시보드")
          .map((item) => (
            <li key={item.label}>
              <button className="not-found-link" onClick={() => onNavigate(item.label)} type="button">
                <Icon name={item.icon} size={20} />
                {t(item.label)}
                <Icon name="arrowUpRight" size={16} />
              </button>
            </li>
          ))}
      </ul>
    </section>
  )
}
