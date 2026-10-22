import { faqs } from "../data/faq"
import { RevealTitle } from "./RevealText"

// Questions with their answers opening under them; <details> keeps them
// usable with Tab and Enter.
export function FaqList({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details className="faq-item" data-reveal key={item.question}>
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}

// The featured questions at the end of the dashboards (data/faq.ts), with
// the way to the help center where the rest are and questions go to the
// operators.
export function FaqSection({ onOpenFaq }: { onOpenFaq: () => void }) {
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
      <FaqList items={faqs.filter((item) => item.featured)} />
      <p className="faq-more" data-reveal>
        찾는 답이 없나요?
        <button className="underline-link" onClick={onOpenFaq} type="button">
          관리자에게 질문하기
        </button>
      </p>
    </section>
  )
}
