import type { CSSProperties } from "react"

import analyticsExample from "../assets/examples/analytics.jpg"
import groupsExample from "../assets/examples/groups.jpg"
import matchesExample from "../assets/examples/matches.jpg"
import measurementExample from "../assets/examples/measurement.jpg"
import { FaqSection } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { LandingHero } from "../components/LandingHero"
import { Lines } from "../components/Lines"
import { Pill } from "../components/Pill"
import { RevealTitle } from "../components/RevealText"
import { RoleMark } from "../components/RoleMark"
import { t } from "../i18n"
import type { NavLabel, Role } from "../types"

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties


// 첫 매칭부터 결과까지의 협찬 하나.
const steps: { title: string; detail: string }[] = [
  {
    title: t("가입하고 소개 쓰기"),
    detail: t("학교 · 회사 이메일로 가입하고, 소개와 행사를 올려요."),
  },
  {
    title: t("추천 매칭 확인하기"),
    detail: t("다섯 가지 기준으로 점수를 매겨, 잘 맞는 상대부터 보여 드려요."),
  },
  {
    title: t("제안하고 답 받기"),
    detail: t("누구든 먼저 제안할 수 있어요. 수락하면 계약서가 생기고, 양쪽이 확인하면 협찬이 확정돼요."),
  },
  {
    title: t("임시 전자 계약서로 정리하기"),
    detail: t("할 일은 계약서에 함께 적고, 끝낸 일은 사진으로 남겨요."),
  },
  {
    title: t("현장에서 재고 리포트로 보기"),
    detail: t("행사 날 QR · 쿠폰 · 방문이 저절로 세지고, 끝나면 리포트가 돼요."),
  },
]

// 데모 계정의 데이터로 둘러보는 회원 화면. 그림은 그 화면이며 예시로 표시한다.
const examples: { page: NavLabel; role: Role; image: string; description: string }[] = [
  {
    page: "추천 매칭",
    role: "학생단체",
    image: matchesExample,
    description: t("잘 맞는 브랜드를 골라 보고 바로 협찬을 제안해요."),
  },
  {
    page: "단체 찾기",
    role: "브랜드",
    image: groupsExample,
    description: t("잘 맞는 학생단체를 골라 보고 바로 협찬을 제안해요."),
  },
  {
    page: "성과",
    role: "학생단체",
    image: measurementExample,
    description: t("QR · 쿠폰 · 매장 방문을 실시간으로 세고 목표와 비교해요."),
  },
  {
    page: "성과 분석",
    role: "브랜드",
    image: analyticsExample,
    description: t("협찬마다 ROAS를 비교하고 분석 보고서를 PDF로 받아요."),
  },
]

// 방문자가 처음 닿는 페이지: uniconnect가 무엇이고 무엇을 하는지(회원
// 대시보드의 구성 요소인 스트라이드의 히어로, 마키, 문구로 만든다), 누구를 위한
// 것인지, 협찬이 어떻게 진행되는지, 열어 볼 수 있는 예시 회원 화면 그림, FAQ
// 순이고, 푸터의 가입 유도로 끝난다. 실시간 데이터가 없어서 API를 기다리지
// 않는다.
export function LandingPage({
  onSignup,
  onOpenExample,
  onOpenFaq,
  onInstall,
}: {
  // 고른 쪽이 있으면 그 쪽으로 가입을 연다.
  onSignup: (role?: Role) => void
  onOpenExample: (role: Role, page: NavLabel) => void
  onOpenFaq: () => void
  // 브라우저에서 연 사이트용 앱 다운로드(앱 안에서는 없다).
  onInstall?: () => void
}) {
  return (
    <div className="landing">
      <LandingHero onInstall={onInstall} onSignup={onSignup} />

      <section className="service-section landing-section" id="how">
        <RevealTitle as="h2" className="section-display">
          {t("협찬이 이어지는 다섯 단계")}
        </RevealTitle>
        <ol className="service-list">
          {steps.map((step, index) => (
            <li className="service-row" data-reveal key={step.title} style={delay(index * 0.08)}>
              <span aria-hidden="true" className="service-index">
                {pad(index + 1)}
              </span>
              <strong>{step.title}</strong>
              <p><Lines text={step.detail} /></p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section" id="examples" tabIndex={-1}>
        <div className="section-head centered">
          <RevealTitle as="h2" className="section-display">
            {t("가입하기 전에 예시 화면으로 둘러보세요")}
          </RevealTitle>
          <p className="landing-note" data-reveal>
            <Lines text={t("지금은 예시 데이터예요. 가입하면 우리 단체 · 매장 기준으로 보여요.")} />
          </p>
        </div>
        <ul className="example-grid stagger">
          {examples.map((example, index) => (
            <li key={example.page} style={{ "--i": index } as CSSProperties}>
              <article className="example-card">
                <div className="example-preview">
                  <img alt="" decoding="async" height={450} loading="lazy" src={example.image} width={640} />
                  <span className="demo-badge">{t("예시 화면")}</span>
                </div>
                <div className="example-body">
                  <span className="example-side">
                    <RoleMark role={example.role} size={22} />
                    {t(example.role)}
                  </span>
                  <h3>{t(example.page)}</h3>
                  <p><Lines text={example.description} /></p>
                  <Pill arrow="right" onClick={() => onOpenExample(example.role, example.page)} variant="outline">
                    {t("예시 보기")}
                  </Pill>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <div className="landing-section" id="faq">
        <FaqSection onOpenFaq={onOpenFaq} />
      </div>
    </div>
  )
}
