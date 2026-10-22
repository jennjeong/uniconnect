import { RevealTitle } from "./RevealText"

// Questions a first visit raises, answered only with what the service does
// today (sign-up, proposals, scheduling, measurement). Prices and refund
// terms stay out until there is a real policy to state.
const questions: { question: string; answer: string }[] = [
  {
    question: "누가 가입할 수 있나요?",
    answer:
      "학생단체와 브랜드가 가입할 수 있어요. 학생단체는 학교 이메일, 브랜드는 회사 이메일로 6자리 인증번호를 받아 확인한 뒤 가입해요.",
  },
  {
    question: "가입하지 않고도 둘러볼 수 있나요?",
    answer:
      "네. 로그인하지 않으면 학생단체 화면과 브랜드 화면을 데모 데이터로 둘러볼 수 있어요. 협찬 제안, 제안 수락, 일정 등록은 로그인한 뒤에 할 수 있어요.",
  },
  {
    question: "협찬 제안은 어떻게 주고받나요?",
    answer:
      "학생단체는 추천 매칭에서, 브랜드는 단체 찾기에서 상대에게 협찬을 제안해요. 학생단체가 보낸 제안은 계정이 있는 브랜드의 받은 제안에 도착하고, 브랜드가 수락하거나 거절하면 그 결과가 제안한 쪽 카드에 표시돼요. 궁금한 점은 상세 페이지의 문의하기로 메시지를 보낼 수 있어요.",
  },
  {
    question: "행사나 캠페인 일정은 어떻게 등록하나요?",
    answer:
      "등록 페이지에서 이름과 인원, 협찬 유형을 고르고 달력에서 날짜를 골라요. 하루 일정은 한 번, 기간은 첫날과 마지막 날을 차례로 누르면 되고 최대 90일까지 고를 수 있어요.",
  },
  {
    question: "협찬 성과는 어떻게 확인하나요?",
    answer:
      "행사 현장의 QR로 참여(스캔), 쿠폰 수령, 매장 방문을 집계해 목표와 비교해요. 학생단체는 성과 리포트를 PDF로, 브랜드는 협찬별 ROAS와 분석 보고서를 PDF로 받을 수 있어요.",
  },
]

// The FAQ at the end of the dashboards. Each answer opens under its
// question; <details> keeps it usable with Tab and Enter.
export function FaqSection() {
  return (
    <section aria-label="자주 묻는 질문" className="faq-section">
      <div className="section-head">
        <span className="eyebrow" data-reveal>
          FAQ
        </span>
        <RevealTitle as="h2" className="section-display">
          자주 묻는 질문
        </RevealTitle>
      </div>
      <div className="faq-list">
        {questions.map((item) => (
          <details className="faq-item" data-reveal key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
