import type { CSSProperties } from "react"

import analyticsExample from "../assets/examples/analytics.jpg"
import groupsExample from "../assets/examples/groups.jpg"
import matchesExample from "../assets/examples/matches.jpg"
import measurementExample from "../assets/examples/measurement.jpg"
import { BrandMark } from "../components/BrandMark"
import { FaqSection } from "../components/FaqSection"
import { Icon } from "../components/Icon"
import { Lines } from "../components/Lines"
import { LogoMarquee } from "../components/LogoMarquee"
import { MeetingHero } from "../components/MeetingHero"
import { Pill } from "../components/Pill"
import { RevealStatement, RevealTitle } from "../components/RevealText"
import { RoleMark } from "../components/RoleMark"
import { brandIndustries, groupFields } from "../data/industries"
import { t } from "../i18n"
import type { NavLabel, Role } from "../types"

const pad = (value: number) => String(value).padStart(2, "0")

const delay = (seconds: number) => ({ "--reveal-delay": `${seconds}s` }) as CSSProperties

// 각 쪽이 여기서 하는 일.
const sides: { role: Role; eyebrow: string; title: string; points: string[]; signup: string }[] = [
  {
    role: "학생단체",
    eyebrow: "For Student Groups",
    title: t("행사에 꼭 맞는 브랜드를 만나요"),
    points: [
      t("업종 적합도와 실적으로 잘 맞는 브랜드를 추천해요"),
      t("제안부터 임시 전자 계약서까지 한곳에서 주고받아요"),
      t("현장 QR로 모은 성과를 리포트로 정리해요"),
    ],
    signup: t("학생단체로 가입하기"),
  },
  {
    role: "브랜드",
    eyebrow: "For Brands",
    title: t("캠퍼스 현장에서 브랜드 팬을 만나요"),
    points: [
      t("학교 · 거리 · 행사 규모로 학생단체를 찾아요"),
      t("받은 제안을 수락하고 계약서로 할 일을 정해요"),
      t("쿠폰과 매장 방문으로 협찬마다 ROAS를 확인해요"),
    ],
    signup: t("브랜드로 가입하기"),
  },
]

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
  onBrowse,
  onOpenExample,
  onOpenFaq,
  onInstall,
}: {
  // 고른 쪽이 있으면 그 쪽으로 가입을 연다.
  onSignup: (role?: Role) => void
  // 한쪽의 예시 대시보드.
  onBrowse: (role: Role) => void
  onOpenExample: (role: Role, page: NavLabel) => void
  onOpenFaq: () => void
  // 브라우저에서 연 사이트용 앱 다운로드(앱 안에서는 없다).
  onInstall?: () => void
}) {
  return (
    <div className="landing">
      <MeetingHero
        eyebrow="Campus Sponsorship Matching"
        lines={[t("좋은 행사와"), t("좋은 브랜드가"), t("만나는 곳")]}
        lead={t("브랜드 추천부터 계약 · 현장 측정 · 리포트까지, 협찬의 모든 과정을 한곳에서.")}
        insight={t("가입은 이메일 인증 한 번이면 돼요.")}
        detail={t("학교 · 회사 이메일로 가입해요. 가입 전에 예시 화면부터 둘러보세요.")}
        primary={{ label: t("지금 시작하기"), onClick: () => onSignup() }}
        secondary={{ label: t("예시 화면 둘러보기"), onClick: () => onBrowse("학생단체") }}
        onInstall={onInstall}
      />

      <LogoMarquee
        label={t("이런 브랜드와 학생단체가 만나요")}
        rows={[
          brandIndustries.map(([industry, label]) => ({
            key: industry,
            mark: <BrandMark match={{ industry }} />,
            label: t(label),
          })),
          groupFields.map(([industry, label]) => ({
            key: industry,
            mark: <BrandMark match={{ industry }} />,
            label: t(label),
          })),
        ]}
      />

      <section className="about-statement-section">
        <span className="eyebrow" data-reveal>
          About uniconnect
        </span>
        <RevealStatement
          lead={t("학생단체와 브랜드를 잇고,")}
          firstChip={<Icon name="link" size={18} />}
          muted={t("협찬의 성과를 숫자로 증명해요")}
          secondChip={<Icon name="chart" size={18} />}
        />
      </section>

      <section className="landing-section" id="sides">
        <div className="section-head centered">
          <span className="eyebrow" data-reveal>
            Who It&apos;s For
          </span>
          <RevealTitle as="h2" className="section-display">
            {t("학생단체도 브랜드도, 협찬은 여기서")}
          </RevealTitle>
        </div>
        <div className="landing-sides">
          {sides.map((side, index) => (
            <article
              className={side.role === "브랜드" ? "landing-side blue" : "landing-side"}
              data-reveal
              key={side.role}
              style={delay(index * 0.1)}
            >
              <div className="landing-side-head">
                <RoleMark role={side.role} size={40} />
                <span className={side.role === "브랜드" ? "eyebrow light" : "eyebrow"}>{side.eyebrow}</span>
              </div>
              <h3>{side.title}</h3>
              <ul className="landing-points">
                {side.points.map((point) => (
                  <li key={point}>
                    <Icon name="check" size={16} />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="landing-side-actions">
                <Pill onClick={() => onSignup(side.role)} variant={side.role === "브랜드" ? "white" : "primary"}>
                  {side.signup}
                </Pill>
                <button className="underline-link" onClick={() => onBrowse(side.role)} type="button">
                  {t("{role} 화면 보기", { role: t(side.role) })}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="service-section landing-section" id="how">
        <span className="eyebrow" data-reveal>
          How It Works
        </span>
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

      <section className="landing-section" id="examples">
        <div className="section-head centered">
          <span className="eyebrow" data-reveal>
            Preview
          </span>
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
