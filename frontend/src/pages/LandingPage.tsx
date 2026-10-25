import type { CSSProperties } from "react"

import analyticsExample from "../assets/examples/analytics.jpg"
import groupsExample from "../assets/examples/groups.jpg"
import matchesExample from "../assets/examples/matches.jpg"
import measurementExample from "../assets/examples/measurement.jpg"
import { BrandMark } from "../components/BrandMark"
import { FaqSection } from "../components/FaqSection"
import { Icon } from "../components/Icon"
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

// What each side does here.
const sides: { role: Role; eyebrow: string; title: string; points: string[]; signup: string }[] = [
  {
    role: "학생단체",
    eyebrow: "For Student Groups",
    title: t("행사에 꼭 맞는 브랜드를 만나요"),
    points: [
      t("업종 적합도와 실적으로 잘 맞는 브랜드를 추천해요"),
      t("제안부터 협찬 약속서까지 한곳에서 주고받아요"),
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
      t("받은 제안을 수락하고 약속서로 할 일을 정해요"),
      t("쿠폰과 매장 방문으로 협찬마다 ROAS를 확인해요"),
    ],
    signup: t("브랜드로 가입하기"),
  },
]

// One sponsorship from the first match to its results.
const steps: { title: string; detail: string }[] = [
  {
    title: t("가입하고 소개 쓰기"),
    detail: t("학교 · 회사 이메일로 가입하고, 상대에게 보일 소개와 행사 · 캠페인을 등록해요."),
  },
  {
    title: t("추천 매칭 확인하기"),
    detail: t("업종 적합도, 겹치는 태그, 실적, 함께한 이력, 답할 준비 다섯 가지로 잘 맞는 상대를 보여 드려요."),
  },
  {
    title: t("제안하고 답 받기"),
    detail: t("학생단체도 브랜드도 먼저 제안할 수 있어요. 수락하면 날짜가 정해진 협찬이 돼요."),
  },
  {
    title: t("협찬 약속서로 정리하기"),
    detail: t("두 쪽이 할 일을 약속서에 적고 함께 확인해요. 끝낸 일은 링크와 사진으로 남겨요."),
  },
  {
    title: t("현장에서 재고 리포트로 보기"),
    detail: t("행사 날 QR 스캔 · 쿠폰 · 매장 방문을 세고, 끝나면 성과 리포트와 ROAS로 정리해요."),
  },
]

// Member screens to look around with the demo accounts' data; the pictures
// are those screens, marked as examples.
const examples: { page: NavLabel; role: Role; image: string; description: string }[] = [
  {
    page: "추천 매칭",
    role: "학생단체",
    image: matchesExample,
    description: t("행사와 잘 맞는 브랜드를 일치율 순으로 보고, 마음에 드는 브랜드에 협찬을 제안해요."),
  },
  {
    page: "단체 찾기",
    role: "브랜드",
    image: groupsExample,
    description: t("캠페인과 잘 맞는 학생단체를 추천, 행사 임박, 분야별로 찾아 협찬을 제안해요."),
  },
  {
    page: "성과",
    role: "학생단체",
    image: measurementExample,
    description: t("행사 QR 스캔, 쿠폰 수령, 매장 방문을 실시간으로 집계하고 목표와 비교해요."),
  },
  {
    page: "성과 분석",
    role: "브랜드",
    image: analyticsExample,
    description: t("협찬마다 집행액, 쿠폰, 방문, ROAS를 비교하고 분석 보고서를 PDF로 내려받아요."),
  },
]

// The page visitors land on: what uniconnect is and does, built from the
// members' dashboard pieces (Stride's hero, marquee and statement), then
// who it is for, how a sponsorship runs, pictures of the member screens
// as examples to open, and the FAQ; the footer's call to sign up closes it.
// It shows no live data, so nothing waits on the API.
export function LandingPage({
  onSignup,
  onBrowse,
  onOpenExample,
  onOpenFaq,
  onInstall,
}: {
  // Opens sign-up, for the side picked when there is one.
  onSignup: (role?: Role) => void
  // The example dashboard of one side.
  onBrowse: (role: Role) => void
  onOpenExample: (role: Role, page: NavLabel) => void
  onOpenFaq: () => void
  // 앱 다운로드, for the site opened in a browser (none inside the app).
  onInstall?: () => void
}) {
  return (
    <div className="landing">
      <MeetingHero
        eyebrow="Campus Sponsorship Matching"
        lines={[t("좋은 행사와"), t("좋은 브랜드가"), t("만나는 곳")]}
        lead={t("행사에 맞는 브랜드 추천부터 제안, 협찬 약속서, 현장 QR 측정과 성과 리포트까지 한곳에서 해요.")}
        insight={t("가입은 이메일 인증 한 번이면 돼요.")}
        detail={t("학생단체는 학교 이메일, 브랜드는 회사 이메일로 가입해요. 가입하기 전에 예시 화면으로 먼저 둘러볼 수 있어요.")}
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
              <p>{step.detail}</p>
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
            {t("데모 학생단체와 데모 브랜드의 예시 데이터예요. 근처 가게처럼 학교마다 다른 화면은 가입하면 우리 단체와 매장 기준으로 보여요.")}
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
                  <p>{example.description}</p>
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
