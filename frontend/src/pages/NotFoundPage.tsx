import { Icon } from "../components/Icon"
import { PageIntro } from "../components/PageIntro"
import { Pill } from "../components/Pill"
import { navItems } from "../data/navigation"
import { t } from "../i18n"
import type { NavLabel, Role } from "../types"

// An address no screen has (the server answers it with 404): says so, with
// the way home and the role's own pages.
export function NotFoundPage({
  role,
  onNavigate,
}: {
  role: Role
  onNavigate: (label: NavLabel) => void
}) {
  return (
    <section className="page-view not-found">
      <PageIntro
        eyebrow="404 · Page not found"
        title={t("페이지를 찾을 수 없어요")}
        description={t("주소가 바뀌었거나 없는 페이지예요. 홈이나 아래 메뉴에서 이어서 둘러보세요.")}
        actions={
          <Pill arrow="right" onClick={() => onNavigate("대시보드")}>
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
