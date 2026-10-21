import { useRef } from "react"

import logo from "../assets/brand/uniconnect_horizontal.svg"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { navItems } from "../data/navigation"
import { createLabel, roles } from "../data/roles"
import { ChromeScene } from "../scenes/ChromeScene"
import { MeshBackdrop } from "../scenes/MeshBackdrop"
import type { Account, NavLabel, Role } from "../types"

// Stride's footer from getlayers.ai: a deep blue mesh card where a chrome
// object settles into the open side as the card scrolls in — here two
// linked rings, the two sides holding on to each other — with the call to
// register over it (on the dashboard only); then the site's links and the
// name as a large silver wordmark on white.
export function Footer({
  role,
  account,
  invite = true,
  onNavigate,
  onSwitchRole,
  onCreate,
  onOpenMessages,
  onOpenProfile,
  onEditProfile,
  onLogin,
  onSignup,
  onLogout,
}: {
  role: Role
  account: Account | null
  // Whether the deep blue card with the call to register comes first.
  invite?: boolean
  onNavigate: (label: NavLabel) => void
  onSwitchRole: (role: Role) => void
  onCreate: () => void
  onOpenMessages: () => void
  onOpenProfile: () => void
  onEditProfile: () => void
  onLogin: () => void
  onSignup: () => void
  onLogout: () => void
}) {
  const stageRef = useRef<HTMLElement>(null)
  const students = role === "학생단체"
  const columns: { title: string; links: { label: string; onClick: () => void }[] }[] = [
    {
      title: "메뉴",
      links: navItems[role].map((item) => ({ label: item.label, onClick: () => onNavigate(item.label) })),
    },
    {
      title: "계정",
      links: account
        ? [
            { label: "내 정보", onClick: onOpenProfile },
            { label: "메시지", onClick: onOpenMessages },
            { label: "로그아웃", onClick: onLogout },
          ]
        : [
            { label: "로그인", onClick: onLogin },
            { label: "회원가입", onClick: onSignup },
          ],
    },
    {
      title: "시작하기",
      links: [
        { label: createLabel(role), onClick: onCreate },
        ...(account
          ? [{ label: "소개 편집", onClick: onEditProfile }]
          : roles.map((item) => ({ label: `${item} 화면 보기`, onClick: () => onSwitchRole(item) }))),
      ],
    },
  ]

  return (
    <footer className="site-footer">
      {invite && (
        <section aria-label="함께 시작하기" className="footer-stage" ref={stageRef}>
          <MeshBackdrop seed={7.2} />
          <ChromeScene anchor={stageRef} kind="rings" mode="enter" spinDirection={-1} />
          <div className="footer-cta">
            <span className="eyebrow light">Let&apos;s connect</span>
            <RevealTitle
              accent={1}
              as="h2"
              className="footer-title"
              lines={students ? ["함께 만들", "협찬이 있나요?"] : ["학생들의 현장과", "이어 볼까요?"]}
            />
            <p className="footer-lead">
              {students
                ? "행사를 등록하면 잘 맞는 브랜드를 찾아 드리고, 끝난 뒤에는 성과를 리포트로 정리해 드려요."
                : "캠페인을 등록하면 잘 맞는 학생단체를 찾아 드리고, 협찬의 효과를 ROAS로 보여 드려요."}
            </p>
            <Pill arrow="up-right" onClick={onCreate} variant="white">
              {createLabel(role)}
            </Pill>
          </div>
        </section>
      )}

      <div className="footer-inner">
        <div className="footer-columns">
          <div className="footer-brand">
            <img alt="uniconnect" height={27} src={logo} width={116} />
            <p>학생단체와 브랜드 사이의 협찬을 잇고, 그 성과를 숫자로 증명하는 성과 측정형 캠퍼스 스폰서십 플랫폼이에요.</p>
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
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} type="button">
            맨 위로 ↑
          </button>
        </div>
      </div>
    </footer>
  )
}
