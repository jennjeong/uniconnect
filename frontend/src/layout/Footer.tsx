import { useRef } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Icon } from "../components/Icon"
import { Pill } from "../components/Pill"
import { legalDocs, type LegalKind } from "../data/legal"
import { RevealTitle } from "../components/RevealText"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { lang, setLang, t } from "../i18n"
import { ChromeScene } from "../scenes/ChromeScene"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, NavLabel, Role } from "../types"

// getlayers.ai의 Stride 푸터. 짙은 파랑 메시 카드에 크롬 오브제가 스크롤에 맞춰
// 열린 쪽으로 자리를 잡는다. 여기서는 서로 이어진 반지 두 개가 두 쪽이 서로를
// 붙잡은 모습을 나타낸다. 그 위에 가입을 권하는 문구가 놓이고 (소개
// 페이지에서는 가입 또는 앱 받기, 대시보드에서도), 그 아래에 사이트 링크와 흰
// 바탕의 큰 은색 워드마크로 이름이 나온다.
export function Footer({
  role,
  account,
  invite = true,
  landing = false,
  onInstall,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenMessages,
  onOpenProfile,
  onOpenFaq,
  onOpenPlans,
  onOpenLegal,
  onEditProfile,
  onLogin,
  onSignup,
  onLogout,
}: {
  role: Role
  account: Account | null
  // 가입을 권하는 짙은 파랑 카드를 맨 앞에 둘지 여부.
  invite?: boolean
  // 소개 페이지의 카드. 양쪽 모두에게 가입이나 앱 받기를 권한다.
  landing?: boolean
  // 앱 다운로드. 브라우저에서 연 사이트를 위한 것이다 (앱 안에서는 없다).
  onInstall?: () => void
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  onOpenMessages: () => void
  onOpenProfile: () => void
  onOpenFaq: () => void
  onOpenPlans: () => void
  onOpenLegal: (kind: LegalKind) => void
  onEditProfile: () => void
  onLogin: () => void
  onSignup: () => void
  onLogout: () => void
}) {
  const stageRef = useRef<HTMLElement>(null)
  const students = role === "학생단체"
  const columns: { title: string; links: { label: string; onClick: () => void }[] }[] = [
    {
      title: t("메뉴"),
      links: navItems[role].map((item) => ({ label: t(item.label), onClick: () => onNavigate(item.label) })),
    },
    {
      title: t("계정"),
      links: account
        ? [
            { label: t("내 정보"), onClick: onOpenProfile },
            { label: t("메시지"), onClick: onOpenMessages },
            { label: t("요금제"), onClick: onOpenPlans },
            { label: t("FAQ · 질문하기"), onClick: onOpenFaq },
            { label: t("로그아웃"), onClick: onLogout },
          ]
        : [
            { label: t("로그인"), onClick: onLogin },
            { label: t("회원가입"), onClick: onSignup },
            { label: t("요금제"), onClick: onOpenPlans },
            { label: t("FAQ · 질문하기"), onClick: onOpenFaq },
          ],
    },
    {
      title: t("시작하기"),
      links: [
        { label: createLabel(role), onClick: onCreate },
        ...(account
          ? [{ label: t("소개 편집"), onClick: onEditProfile }]
          : roles.map((item) => ({ label: t("{role} 화면 보기", { role: t(item) }), onClick: () => onSwitchRole(item) }))),
      ],
    },
  ]

  return (
    <footer className="site-footer">
      {invite && (
        <section aria-label={t("함께 시작하기")} className="footer-stage" ref={stageRef}>
          <MeshBackdrop seed={7.2} />
          <ChromeScene anchor={stageRef} kind="rings" mode="enter" spinDirection={-1} />
          <div className="footer-cta">
            <span className="eyebrow light">Let&apos;s Connect</span>
            <RevealTitle
              accent={1}
              as="h2"
              className="footer-title"
              lines={
                landing
                  ? [t("캠퍼스 협찬,"), t("지금 시작해 볼까요?")]
                  : students
                    ? [t("함께 만들"), t("협찬이 있나요?")]
                    : [t("학생들의 현장과"), t("이어 볼까요?")]
              }
            />
            <p className="footer-lead">
              {landing
                ? t("학생단체도 브랜드도 이메일 인증 한 번으로 가입해요. 웹에서 바로 쓰고 원하면 앱으로 설치할 수 있어요.")
                : students
                  ? t("행사를 등록하면 잘 맞는 브랜드를 찾아 드리고 끝난 뒤에는 성과를 리포트로 정리해 드려요.")
                  : t("캠페인을 등록하면 잘 맞는 학생단체를 찾아 드리고 협찬의 효과를 ROAS로 보여 드려요.")}
            </p>
            {landing ? (
              <div className="footer-actions">
                <Pill arrow="up-right" onClick={onSignup} variant="white">
                  {t("회원가입")}
                </Pill>
                {onInstall && (
                  <Pill className="hero-install" onClick={onInstall} variant="outline-light">
                    <Icon name="download" size={16} />
                    {t("앱 다운로드")}
                  </Pill>
                )}
              </div>
            ) : (
              <Pill arrow="up-right" onClick={onCreate} variant="white">
                {createLabel(role)}
              </Pill>
            )}
          </div>
        </section>
      )}

      <div className="footer-inner">
        <div className="footer-columns">
          <div className="footer-brand">
            <img alt="uniconnect" height={27} src={logo} width={116} />
            <p>{t("학생단체와 브랜드 사이의 협찬을 잇고 그 성과를 숫자로 증명하는 캠퍼스 스폰서십 플랫폼이에요.")}</p>
          </div>
          {columns.map((column) => (
            <div className="footer-column" key={column.title}>
              <span>{column.title}</span>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    <button onClick={link.onClick} type="button">
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p aria-hidden="true" className="footer-wordmark">
          UNICONNECT
        </p>

        <div className="footer-legal">
          <span>© {new Date().getFullYear()} uniconnect. All rights reserved.</span>
          {/* 캠퍼스와 매장의 위치는 OpenStreetMap 데이터(ODbL)로 찾으며, 이 데이터는 출처 표기를 요구한다. */}
          <a className="footer-credit" href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" target="_blank">
            Map data © OpenStreetMap contributors
          </a>
          <nav aria-label={t("약관과 방침")} className="footer-policies">
            {(Object.keys(legalDocs) as LegalKind[]).map((kind) => (
              <button key={kind} onClick={() => onOpenLegal(kind)} type="button">
                {legalDocs[kind].title}
              </button>
            ))}
          </nav>
          {/* 다른 언어를 그 언어 자체로 적는다. 고른 언어는 기억한다. */}
          <button lang={lang === "ko" ? "en" : "ko"} onClick={() => setLang(lang === "ko" ? "en" : "ko")} type="button">
            {lang === "ko" ? "English" : "한국어"}
          </button>
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button">
            {t("맨 위로 ↑")}
          </button>
        </div>
      </div>
    </footer>
  )
}
