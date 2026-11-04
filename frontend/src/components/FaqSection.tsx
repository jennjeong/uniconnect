import { useFaqs } from "../hooks/useSiteState"
import { t } from "../i18n"
import { RevealTitle } from "./RevealText"

// 답이 아래로 펼쳐지는 질문 목록. <details>를 써서 Tab과 Enter로도 쓸 수 있다.
// `openQuestion`은 하나를 열어 둔 채 시작한다 (검색에서 고른 경우).
export function FaqList({
  items,
  openQuestion,
}: {
  items: { question: string; answer: string }[]
  openQuestion?: string
}) {
  return (
    <div className="faq-list">
      {items.map((item) => (
        <details
          className="faq-item"
          data-question={item.question}
          data-reveal
          key={item.question}
          open={item.question === openQuestion}
        >
          <summary>{item.question}</summary>
          <p>{item.answer}</p>
        </details>
      ))}
    </div>
  )
}

// 대시보드 끝에 놓는 추천 질문 (data/faq.ts). 나머지 질문이 있는 도움말 센터로
// 가는 길과, 운영진에게 질문을 보내는 길을 함께 둔다.
export function FaqSection({ onOpenFaq }: { onOpenFaq: () => void }) {
  const faqs = useFaqs()
  return (
    <section aria-label={t("자주 묻는 질문")} className="faq-section">
      <div className="section-head">
        <span className="eyebrow" data-reveal>
          FAQ
        </span>
        <RevealTitle as="h2" className="section-display">
          {t("자주 묻는 질문")}
        </RevealTitle>
      </div>
      <FaqList items={faqs.filter((item) => item.featured)} />
      <p className="faq-more" data-reveal>
        {t("찾는 답이 없나요?")}
        <button className="underline-link" onClick={onOpenFaq} type="button">
          {t("관리자에게 질문하기")}
        </button>
      </p>
    </section>
  )
}
