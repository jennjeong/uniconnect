import { randomUUID } from "node:crypto"

import { HttpError } from "./errors.js"
import { sponsorTypes } from "./validation.js"
import type { Agreement, AgreementClause, AgreementItem, ChatSide } from "../types.js"

// 협찬 형태별 표준 계약 템플릿이다(#333). 형태는 제안 조건의 형태(terms.kinds)와 같은
// 현금 · 제품 · 서비스 · 기타이며, 이슈의 '현물'은 제품, '할인'은 서비스, '체험'은 제품이나
// 서비스에 담는다. 문구는 법률 검토(#329) 전의 초안이라 draft로 표시해 보낸다.
// 문구를 바꾸면 이미 붙인 계약서는 그때의 문구를 그대로 가진다(계약 내용이라서).
export const templateDraft = true

type Clause = Omit<AgreementClause, "kind">
type Template = { kind: string; clauses: Clause[]; items: { side: ChatSide; label: string }[] }

// 어느 형태든 붙는 조항이다.
const common: Clause[] = [
  {
    id: "common-promotion",
    title: "브랜드 노출",
    text: "학생단체는 계약서의 할 일에 적은 방법으로 브랜드를 알린다. 브랜드의 이름과 로고는 이 행사를 알리는 데에만 쓴다.",
  },
  {
    id: "common-change",
    title: "변경과 취소",
    text: "조건을 바꾸려면 계약서를 고치고 양쪽이 다시 확인한다. 협찬을 취소하려면 계약서에서 취소를 요청하고 상대의 동의를 받는다.",
  },
  {
    id: "common-dispute",
    title: "약속이 지켜지지 않을 때",
    text: "먼저 메시지로 협의한다. 풀리지 않으면 계약서에서 분쟁을 접수할 수 있다. 운영자는 양쪽의 기록을 보고 결론을 남기지만, 그 결론이 결제나 계정을 바꾸지는 않는다.",
  },
]

export const contractTemplates: Template[] = [
  {
    kind: "현금",
    clauses: [
      {
        id: "cash-payment",
        title: "협찬금 지급",
        text: "브랜드는 계약서의 현금 협찬액을 지급일까지 학생단체가 알려 준 계좌로 보낸다. 보낸 뒤 계약서에 지급을 표시하고, 학생단체는 받은 뒤 수령을 표시한다.",
      },
      {
        id: "cash-use",
        title: "협찬금 사용",
        text: "학생단체는 협찬금을 이 행사를 준비하고 운영하는 데에만 쓴다. 브랜드가 요청하면 쓴 내역을 공유한다.",
      },
      {
        id: "cash-refund",
        title: "행사가 열리지 않을 때",
        text: "행사가 열리지 않으면 학생단체는 받은 협찬금을 돌려준다. 행사가 일부만 진행됐으면 돌려줄 금액을 양쪽이 협의해 정한다.",
      },
    ],
    items: [{ side: "group", label: "협찬금 사용 내역 공유하기" }],
  },
  {
    kind: "제품",
    clauses: [
      {
        id: "goods-delivery",
        title: "제품 전달",
        text: "브랜드는 계약서에 적은 제품과 수량을 전달 기한까지 학생단체에 보낸다. 체험용 샘플도 같다. 따로 정하지 않았으면 배송비는 브랜드가 낸다.",
      },
      {
        id: "goods-receipt",
        title: "수령 확인",
        text: "학생단체는 받은 날 수량과 상태를 확인해 계약서에 표시한다. 모자라거나 상한 것은 받은 날부터 3일 안에 브랜드에 알린다.",
      },
      {
        id: "goods-use",
        title: "제품 사용",
        text: "학생단체는 제품을 행사 참여자에게 나눠 주거나 행사에서 보여 주는 데에만 쓰고, 팔지 않는다. 남은 제품의 처리는 양쪽이 협의한다.",
      },
    ],
    items: [{ side: "group", label: "협찬 물품 수령 확인" }],
  },
  {
    kind: "서비스",
    clauses: [
      {
        id: "service-offer",
        title: "서비스 제공",
        text: "브랜드는 계약서에 적은 서비스(할인, 쿠폰, 체험, 대관 등)를 정한 기간과 조건으로 제공한다.",
      },
      {
        id: "service-notice",
        title: "이용 조건 안내",
        text: "학생단체는 참여자에게 이용할 수 있는 기간, 횟수, 매장을 정확히 알린다. 브랜드는 매장 직원에게 같은 조건을 알린다.",
      },
      {
        id: "service-limits",
        title: "할인과 쿠폰",
        text: "할인과 쿠폰은 계약서에 적은 기간에만 쓸 수 있고 현금으로 바꿀 수 없다. 기간을 바꾸려면 계약서를 고쳐 다시 확인한다.",
      },
    ],
    items: [
      { side: "brand", label: "할인·체험 이용 조건 정리해 보내기" },
      { side: "group", label: "참여자에게 이용 조건 알리기" },
    ],
  },
  {
    kind: "기타",
    clauses: [
      {
        id: "other-scope",
        title: "협찬 내용",
        text: "계약서의 할 일에 적은 것이 협찬의 전부다. 메시지로 더 합의한 것은 할 일에 더하고 양쪽이 다시 확인해야 계약 내용이 된다.",
      },
    ],
    items: [],
  },
]

// 화면이 고를 수 있게 보여 주는 템플릿이다.
export const templatesView = () => ({
  draft: templateDraft,
  kinds: sponsorTypes,
  common,
  templates: contractTemplates,
})

// 고른 형태들. 비우면 조항을 떼어 낸다.
export function parseTemplateKinds(value: unknown) {
  if (!Array.isArray(value)) throw new HttpError(400, "협찬 형태를 골라 주세요.")
  const kinds = [...new Set(value.map((kind) => String(kind)))]
  if (kinds.some((kind) => !sponsorTypes.includes(kind))) throw new HttpError(400, "협찬 형태를 목록에서 골라 주세요.")
  // 목록의 순서로 둔다.
  return sponsorTypes.filter((kind) => kinds.includes(kind))
}

// 고른 형태의 조항: 형태별 조항 뒤에 공통 조항이다.
export const clausesFor = (kinds: string[]): AgreementClause[] =>
  kinds.length
    ? [
        ...contractTemplates
          .filter((template) => kinds.includes(template.kind))
          .flatMap((template) => template.clauses.map((clause) => ({ ...clause, kind: template.kind }))),
        ...common.map((clause) => ({ ...clause, kind: "공통" })),
      ]
    : []

// 계약서에 템플릿을 붙인다. 조항은 고른 형태의 것으로 바꾸고, 형태의 기본 할 일은 같은
// 문구가 없을 때만 더한다(지우지 않는다). 할 일의 한도(maxItems)를 넘는 것은 더하지 않는다.
// 바뀌었는지 돌려준다.
export function applyTemplate(agreement: Agreement, kinds: string[], maxItems: number, now = new Date()) {
  const clauses = clausesFor(kinds)
  const before = JSON.stringify([agreement.clauses ?? [], agreement.items.map((item) => [item.side, item.label])])
  const added: AgreementItem[] = []
  for (const { side, label } of contractTemplates.filter((template) => kinds.includes(template.kind)).flatMap((template) => template.items)) {
    if ([...agreement.items, ...added].some((item) => item.label === label)) continue
    if (agreement.items.length + added.length >= maxItems) break
    added.push({ id: randomUUID(), side, label, links: [], photos: [] })
  }
  agreement.items = [...agreement.items, ...added]
  if (clauses.length) {
    agreement.clauses = clauses
    agreement.template = { kinds, draft: templateDraft, appliedAt: now.toISOString() }
  } else {
    delete agreement.clauses
    delete agreement.template
  }
  return JSON.stringify([agreement.clauses ?? [], agreement.items.map((item) => [item.side, item.label])]) !== before
}
